import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
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

async function selectAll(supabase, table, columns, applyQuery = (query) => query) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const query = applyQuery(supabase.from(table).select(columns).range(from, to));
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

function compactRow(row, columns) {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
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

function monthFromDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}/.test(value)
    ? `${value.slice(0, 7)}-01`
    : null;
}

function getImpactedReviewMonth(transaction) {
  if (transaction.direction === "credit") {
    return monthFromDate(transaction.rent_period_month) ?? monthFromDate(transaction.posted_at);
  }

  return monthFromDate(transaction.posted_at);
}

async function collectCleanupCandidates(supabase) {
  const [
    manualSnapshots,
    legacyBankTransactions,
    plaidBankConnections,
    plaidRawBankTransactions,
    plaidPropertyTransactions,
    monthlyReviews
  ] = await Promise.all([
    selectAll(
      supabase,
      "real_estate_metric_snapshots",
      "id, asset_id, metric_type, value, recorded_at, source, note",
      (query) => query.eq("source", "manual")
    ),
    selectAll(
      supabase,
      "real_estate_property_transactions",
      "id, asset_id, provider, provider_transaction_id, account_id, account_name, posted_at, direction, classification, category, rent_period_month, amount, description, note",
      (query) => query.eq("provider", "legacy_bank")
    ),
    selectAll(
      supabase,
      "real_estate_bank_connections",
      "id, asset_id, provider, account_id, account_name, institution_name, status",
      (query) => query.eq("provider", "plaid")
    ),
    selectAll(
      supabase,
      "real_estate_raw_bank_transactions",
      "id, provider, provider_item_id, provider_account_id, provider_transaction_id",
      (query) => query.eq("provider", "plaid")
    ),
    selectAll(
      supabase,
      "real_estate_property_transactions",
      "id, asset_id, provider, provider_transaction_id, account_id, posted_at, classification, amount",
      (query) => query.eq("provider", "plaid")
    ),
    selectAll(
      supabase,
      "real_estate_monthly_reviews",
      "id, asset_id, review_month, closed_at"
    )
  ]);
  const impactedMonthlyReviews = Array.from(
    new Set(
      legacyBankTransactions.flatMap((transaction) => {
        const reviewMonth = getImpactedReviewMonth(transaction);

        return reviewMonth ? [`${transaction.asset_id}:${reviewMonth}`] : [];
      })
    )
  )
    .map((key) => {
      const [assetId, reviewMonth] = key.split(":");

      return { assetId, reviewMonth };
    })
    .sort((a, b) =>
      `${a.assetId}:${a.reviewMonth}`.localeCompare(`${b.assetId}:${b.reviewMonth}`)
    );
  const affectedClosedReviews = monthlyReviews.filter((review) =>
    review.closed_at &&
    impactedMonthlyReviews.some(
      (month) => month.assetId === review.asset_id && month.reviewMonth === review.review_month
    )
  );

  return {
    affectedClosedReviews,
    impactedMonthlyReviews,
    legacyBankTransactions,
    manualSnapshots,
    preservedPlaid: {
      bankConnections: plaidBankConnections,
      propertyTransactions: plaidPropertyTransactions,
      rawBankTransactions: plaidRawBankTransactions
    }
  };
}

function summarize(collected) {
  return {
    affectedClosedMonthlyReviews: collected.affectedClosedReviews.length,
    impactedMonthlyReviews: collected.impactedMonthlyReviews.length,
    legacyBankTransactions: collected.legacyBankTransactions.length,
    manualSnapshots: collected.manualSnapshots.length,
    preservedPlaidBankConnections: collected.preservedPlaid.bankConnections.length,
    preservedPlaidPropertyTransactions: collected.preservedPlaid.propertyTransactions.length,
    preservedPlaidRawBankTransactions: collected.preservedPlaid.rawBankTransactions.length
  };
}

async function writeBackup(collected) {
  const backupPath = path.join("tmp", `real-estate-manual-legacy-cleanup-${timestamp}.json`);

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
    deletedLegacyBankTransactions: 0,
    deletedManualSnapshots: 0
  };

  if (collected.legacyBankTransactions.length > 0) {
    await deleteByIds(
      supabase,
      "real_estate_property_transactions",
      collected.legacyBankTransactions.map((transaction) => transaction.id)
    );
    result.deletedLegacyBankTransactions = collected.legacyBankTransactions.length;
  }

  if (collected.manualSnapshots.length > 0) {
    await deleteByIds(
      supabase,
      "real_estate_metric_snapshots",
      collected.manualSnapshots.map((snapshot) => snapshot.id)
    );
    result.deletedManualSnapshots = collected.manualSnapshots.length;
  }

  return result;
}

function buildReport(collected) {
  return {
    candidates: {
      affectedClosedReviews: collected.affectedClosedReviews.map((row) =>
        compactRow(row, ["id", "asset_id", "review_month", "closed_at"])
      ),
      impactedMonthlyReviews: collected.impactedMonthlyReviews,
      legacyBankTransactions: collected.legacyBankTransactions.map((row) =>
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
      manualSnapshots: collected.manualSnapshots.map((row) =>
        compactRow(row, ["id", "asset_id", "metric_type", "value", "recorded_at", "source"])
      )
    },
    mode: shouldApply ? "apply" : "dry-run",
    summary: summarize(collected)
  };
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
      ? "Apply completed. Review the backup JSON before deleting it."
      : "Dry run only. Re-run with --apply to delete manual snapshots and legacy bank transactions."
  );
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
const collected = await collectCleanupCandidates(supabase);
const report = buildReport(collected);

if (shouldApply) {
  report.applyResult = await applyCleanup(supabase, collected);
}

printReport(report);
