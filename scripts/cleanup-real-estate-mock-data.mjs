import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const shouldReplaceValuations = args.has("--replace-valuation-with-rentcast");
const shouldOutputJson = args.has("--json");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

function parseEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

async function loadEnvFile(filePath) {
  const text = await readFile(filePath, "utf8").catch(() => "");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([^=]+)=(.*)$/);

    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = parseEnvValue(match[2]);

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(key) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function monthFromDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}/.test(value)
    ? value.slice(0, 7)
    : null;
}

function getImpactedReviewMonth(transaction) {
  if (transaction.direction === "credit") {
    return monthFromDate(transaction.rent_period_month) ?? monthFromDate(transaction.posted_at);
  }

  return monthFromDate(transaction.posted_at);
}

function compactRow(row, columns) {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
}

async function selectAll(supabase, table, columns, applyQuery = (query) => query) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const query = applyQuery(
      supabase
        .from(table)
        .select(columns)
        .range(from, to)
    );
    const { data, error } = await query;

    if (error) {
      throw new Error(`Could not query ${table}: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return rows;
}

function chunk(values, size = 200) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function deleteByIds(supabase, table, ids) {
  for (const idChunk of chunk(ids)) {
    const { error } = await supabase.from(table).delete().in("id", idChunk);

    if (error) {
      throw new Error(`Could not delete from ${table}: ${error.message}`);
    }
  }
}

async function updateAssetValue(supabase, assetId, value) {
  const { error } = await supabase
    .from("assets")
    .update({
      updated_at: new Date().toISOString(),
      value
    })
    .eq("id", assetId);

  if (error) {
    throw new Error(`Could not update asset ${assetId}: ${error.message}`);
  }
}

async function updatePropertyValuation(supabase, property, valuation) {
  const { error: propertyError } = await supabase
    .from("real_estate_properties")
    .update({
      current_market_value: valuation.value,
      current_market_value_source: "provider",
      current_market_value_synced_at: valuation.syncedAt,
      updated_at: valuation.syncedAt
    })
    .eq("asset_id", property.asset_id);

  if (propertyError) {
    throw new Error(
      `Could not update property valuation for ${property.asset_id}: ${propertyError.message}`
    );
  }

  await updateAssetValue(supabase, property.asset_id, valuation.value);

  const { error: snapshotError } = await supabase
    .from("real_estate_metric_snapshots")
    .upsert(
      {
        asset_id: property.asset_id,
        metric_type: "current_market_value",
        value: valuation.value,
        recorded_at: valuation.syncedAt.slice(0, 10),
        source: "provider",
        note: valuation.note
      },
      {
        onConflict: "asset_id,metric_type,recorded_at"
      }
    );

  if (snapshotError) {
    throw new Error(
      `Could not save provider snapshot for ${property.asset_id}: ${snapshotError.message}`
    );
  }

  const { error: deleteSnapshotError } = await supabase
    .from("real_estate_metric_snapshots")
    .delete()
    .eq("asset_id", property.asset_id)
    .eq("metric_type", "current_market_value")
    .eq("source", "mock");

  if (deleteSnapshotError) {
    throw new Error(
      `Could not delete mock valuation snapshots for ${property.asset_id}: ${deleteSnapshotError.message}`
    );
  }
}

function getRentCastRequestUrl(address) {
  const url = new URL("https://api.rentcast.io/v1/avm/value");

  url.searchParams.set("address", address);
  url.searchParams.set("compCount", "5");
  url.searchParams.set("lookupSubjectAttributes", "true");
  url.searchParams.set("suppressLogging", "true");

  return url;
}

function toPositiveInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

async function fetchRentCastValuation(property) {
  const apiKey = requireEnv("RENTCAST_API_KEY");
  const response = await fetch(getRentCastRequestUrl(property.address), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-Api-Key": apiKey
    },
    signal: AbortSignal.timeout(15000)
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`RentCast HTTP ${response.status}: ${bodyText.slice(0, 240)}`);
  }

  const body = JSON.parse(bodyText);
  const value = toPositiveInteger(body.price);

  if (!value) {
    throw new Error("RentCast response did not include a valid price.");
  }

  return {
    note: "Automated property valuation sync.",
    syncedAt: new Date().toISOString(),
    value
  };
}

function buildMockTextScan(rowsByTable) {
  const scanConfig = [
    {
      columns: ["id", "name", "type"],
      idColumn: "id",
      rows: rowsByTable.assets,
      table: "assets"
    },
    {
      columns: ["asset_id", "address", "county", "parcel_number", "current_market_value_source"],
      idColumn: "asset_id",
      rows: rowsByTable.properties,
      table: "real_estate_properties"
    },
    {
      columns: ["id", "metric_type", "source", "note"],
      idColumn: "id",
      rows: rowsByTable.snapshots,
      table: "real_estate_metric_snapshots"
    },
    {
      columns: [
        "id",
        "provider",
        "provider_transaction_id",
        "account_name",
        "description",
        "memo",
        "note"
      ],
      idColumn: "id",
      rows: rowsByTable.transactions,
      table: "real_estate_property_transactions"
    },
    {
      columns: ["id", "provider", "account_name", "institution_name", "status"],
      idColumn: "id",
      rows: rowsByTable.bankConnections,
      table: "real_estate_bank_connections"
    },
    {
      columns: ["id", "asset_id", "review_month", "note"],
      idColumn: "id",
      rows: rowsByTable.monthlyReviews,
      table: "real_estate_monthly_reviews"
    }
  ];

  return scanConfig.flatMap((config) =>
    config.rows.flatMap((row) =>
      config.columns
        .filter((column) => String(row[column] ?? "").toLowerCase().includes("mock"))
        .map((column) => ({
          column,
          id: row[config.idColumn],
          table: config.table,
          value: row[column]
        }))
    )
  );
}

async function collectMockData(supabase) {
  const [
    transactions,
    snapshots,
    properties,
    assets,
    bankConnections,
    monthlyReviews,
    allPropertiesForTextScan,
    allSnapshotsForTextScan,
    allTransactionsForTextScan
  ] = await Promise.all([
    selectAll(
      supabase,
      "real_estate_property_transactions",
      "id, asset_id, provider, provider_transaction_id, account_id, account_name, posted_at, direction, classification, category, rent_period_month, description, memo, note",
      (query) => query.eq("provider", "mock")
    ),
    selectAll(
      supabase,
      "real_estate_metric_snapshots",
      "id, asset_id, metric_type, value, recorded_at, source, note",
      (query) => query.eq("source", "mock")
    ),
    selectAll(
      supabase,
      "real_estate_properties",
      "asset_id, address, purchase_price, current_market_value, current_market_value_source, current_market_value_synced_at",
      (query) => query.eq("current_market_value_source", "mock")
    ),
    selectAll(supabase, "assets", "id, name, type, value"),
    selectAll(
      supabase,
      "real_estate_bank_connections",
      "id, asset_id, provider, account_name, institution_name, status"
    ),
    selectAll(
      supabase,
      "real_estate_monthly_reviews",
      "id, asset_id, review_month, closed_at, note"
    ),
    selectAll(
      supabase,
      "real_estate_properties",
      "asset_id, address, county, parcel_number, current_market_value_source"
    ),
    selectAll(
      supabase,
      "real_estate_metric_snapshots",
      "id, asset_id, metric_type, source, note"
    ),
    selectAll(
      supabase,
      "real_estate_property_transactions",
      "id, asset_id, provider, provider_transaction_id, account_name, description, memo, note"
    )
  ]);
  const mockPropertyAssetIds = new Set(properties.map((property) => property.asset_id));
  const relatedAssets = assets.filter((asset) => mockPropertyAssetIds.has(asset.id));
  const impactedReviewMonths = Array.from(
    new Set(
      transactions.flatMap((transaction) => {
        const month = getImpactedReviewMonth(transaction);

        return month ? [`${transaction.asset_id}:${month}`] : [];
      })
    )
  )
    .map((key) => {
      const [assetId, month] = key.split(":");

      return {
        assetId,
        reviewMonth: `${month}-01`
      };
    })
    .sort((a, b) =>
      `${a.assetId}:${a.reviewMonth}`.localeCompare(`${b.assetId}:${b.reviewMonth}`)
    );
  const affectedClosedReviews = monthlyReviews.filter((review) =>
    review.closed_at &&
    impactedReviewMonths.some(
      (month) =>
        month.assetId === review.asset_id && month.reviewMonth === review.review_month
    )
  );
  const rowsByTable = {
    assets,
    bankConnections,
    monthlyReviews,
    properties: allPropertiesForTextScan,
    snapshots: allSnapshotsForTextScan,
    transactions: allTransactionsForTextScan
  };

  return {
    affectedClosedReviews,
    broadMockTextMatches: buildMockTextScan(rowsByTable),
    impactedReviewMonths,
    mockPropertyAssets: relatedAssets,
    mockPropertyTransactions: transactions,
    mockValuationProperties: properties,
    mockValuationSnapshots: snapshots
  };
}

async function reopenImpactedReviews(supabase, impactedReviewMonths) {
  const updatedAt = new Date().toISOString();

  for (const review of impactedReviewMonths) {
    const { error } = await supabase
      .from("real_estate_monthly_reviews")
      .update({
        closed_at: null,
        updated_at: updatedAt
      })
      .eq("asset_id", review.assetId)
      .eq("review_month", review.reviewMonth);

    if (error) {
      throw new Error(
        `Could not reopen ${review.assetId} ${review.reviewMonth}: ${error.message}`
      );
    }
  }
}

function summarize(collected) {
  return {
    affectedClosedMonthlyReviews: collected.affectedClosedReviews.length,
    broadMockTextMatches: collected.broadMockTextMatches.length,
    impactedMonthlyReviews: collected.impactedReviewMonths.length,
    mockPropertyAssets: collected.mockPropertyAssets.length,
    mockPropertyTransactions: collected.mockPropertyTransactions.length,
    mockValuationProperties: collected.mockValuationProperties.length,
    mockValuationSnapshots: collected.mockValuationSnapshots.length
  };
}

async function writeBackup(collected) {
  const backupPath = path.join("tmp", `real-estate-mock-cleanup-${timestamp}.json`);

  await mkdir(path.dirname(backupPath), { recursive: true });
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        data: collected,
        summary: summarize(collected)
      },
      null,
      2
    )
  );

  return backupPath;
}

async function applyCleanup(supabase, collected) {
  const result = {
    backupPath: await writeBackup(collected),
    deletedMockTransactions: 0,
    deletedMockValuationSnapshots: 0,
    reopenedMonthlyReviews: 0,
    skippedValuations: [],
    updatedValuations: []
  };

  if (collected.mockPropertyTransactions.length > 0) {
    await deleteByIds(
      supabase,
      "real_estate_property_transactions",
      collected.mockPropertyTransactions.map((transaction) => transaction.id)
    );
    result.deletedMockTransactions = collected.mockPropertyTransactions.length;
  }

  if (collected.impactedReviewMonths.length > 0) {
    await reopenImpactedReviews(supabase, collected.impactedReviewMonths);
    result.reopenedMonthlyReviews = collected.impactedReviewMonths.length;
  }

  const mockValuationPropertyAssetIds = new Set(
    collected.mockValuationProperties.map((property) => property.asset_id)
  );
  const standaloneMockValuationSnapshots = collected.mockValuationSnapshots.filter(
    (snapshot) => !mockValuationPropertyAssetIds.has(snapshot.asset_id)
  );

  if (standaloneMockValuationSnapshots.length > 0) {
    await deleteByIds(
      supabase,
      "real_estate_metric_snapshots",
      standaloneMockValuationSnapshots.map((snapshot) => snapshot.id)
    );
    result.deletedMockValuationSnapshots += standaloneMockValuationSnapshots.length;
  }

  if (shouldReplaceValuations) {
    for (const property of collected.mockValuationProperties) {
      try {
        const valuation = await fetchRentCastValuation(property);

        await updatePropertyValuation(supabase, property, valuation);
        result.deletedMockValuationSnapshots += collected.mockValuationSnapshots.filter(
          (snapshot) => snapshot.asset_id === property.asset_id
        ).length;
        result.updatedValuations.push({
          assetId: property.asset_id,
          value: valuation.value
        });
      } catch (error) {
        result.skippedValuations.push({
          assetId: property.asset_id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }

  return result;
}

function printReport(report) {
  if (shouldOutputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(JSON.stringify(report.summary, null, 2));
  console.log("");
  console.log(
    shouldApply
      ? "Apply completed. Review the JSON output for details."
      : "Dry run only. Re-run with --apply to delete mock transaction rows and standalone mock valuation snapshots."
  );

  if (!shouldApply && report.summary.mockValuationProperties > 0) {
    console.log(
      "Valuation replacement requires --apply --replace-valuation-with-rentcast and will call RentCast."
    );
  }
}

await loadEnvFile(".env.local");

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
const collected = await collectMockData(supabase);
const report = {
  mode: shouldApply ? "apply" : "dry-run",
  replaceValuationsWithRentCast: shouldReplaceValuations,
  summary: summarize(collected),
  candidates: {
    affectedClosedReviews: collected.affectedClosedReviews.map((row) =>
      compactRow(row, ["id", "asset_id", "review_month", "closed_at"])
    ),
    broadMockTextMatches: collected.broadMockTextMatches,
    impactedReviewMonths: collected.impactedReviewMonths,
    mockPropertyAssets: collected.mockPropertyAssets.map((row) =>
      compactRow(row, ["id", "name", "type", "value"])
    ),
    mockPropertyTransactions: collected.mockPropertyTransactions.map((row) =>
      compactRow(row, [
        "id",
        "asset_id",
        "provider_transaction_id",
        "posted_at",
        "direction",
        "classification",
        "rent_period_month",
        "amount",
        "description"
      ])
    ),
    mockValuationProperties: collected.mockValuationProperties.map((row) =>
      compactRow(row, [
        "asset_id",
        "address",
        "purchase_price",
        "current_market_value",
        "current_market_value_source",
        "current_market_value_synced_at"
      ])
    ),
    mockValuationSnapshots: collected.mockValuationSnapshots.map((row) =>
      compactRow(row, ["id", "asset_id", "metric_type", "value", "recorded_at", "source"])
    )
  }
};

if (shouldApply) {
  report.applyResult = await applyCleanup(supabase, collected);
}

printReport(report);
