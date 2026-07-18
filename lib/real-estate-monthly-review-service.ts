import {
  fetchBankTransactions,
  PlaidItemDisconnectedError,
  type BankTransaction,
  type BankTransactionProviderName
} from "@/lib/banking/transaction-provider";
import {
  getActiveRealEstateTransactionRules,
  getRealEstateAssetDetail
} from "@/lib/real-estate";
import {
  getPlaidItemConnectionKey,
  getUniquePlaidAccountConnections
} from "@/lib/real-estate-bank-connections";
import {
  getMonthlyDataCoverageAssessment,
  isMonthlyDataCoverageCloseBlocked,
  type RealEstateMonthlyDataCoverageAssessment
} from "@/lib/real-estate-data-coverage";
import {
  getMonthlyReviewAssessment,
  RENT_TRANSACTION_SEARCH_BUFFER_DAYS
} from "@/lib/real-estate-monthly-review";
import {
  filterRentCreditDecisionsForReviewScope,
  getMonthlyExpenseDebitSyncDecisions,
  getMonthlyRentCreditSyncDecisions
} from "@/lib/real-estate-monthly-transaction-sync";
import {
  getClaimedRawBankTransactionIdsForOtherAssets,
  getPendingRawBankTransactionCleanupDescriptionsByRawId,
  getPendingRawBankTransactionIdsClaimedByOtherAssets,
  getUnreviewedRawBankTransactionClaimDescriptionsByRawId,
  isRawBankTransactionClaimingClassification
} from "@/lib/real-estate-transaction-ownership";
import { findMatchingTransactionRule } from "@/lib/real-estate-transaction-rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  RealEstateExpenseCategory,
  RealEstateTransactionClassification
} from "@/types/wealth";

const MIN_RENT_CREDIT_REVIEW_AMOUNT = 10;
const RAW_BANK_TRANSACTION_STALE_MS = 12 * 60 * 60 * 1000;

export const MONTHLY_AUTO_REVIEW_CLOSE_NOTE =
  "Automatically closed by monthly auto review after rent and expense sync.";

interface PropertyRentMatchRow {
  monthly_rent: string | number;
  rent_match_tolerance: string | number;
}

interface PropertyBankConnectionRow {
  id: string;
  provider: string;
  access_token: string;
  account_id: string;
  account_name: string;
  account_type: string | null;
  account_subtype: string | null;
  institution_name: string | null;
  institution_id: string | null;
  last_four: string | null;
  provider_item_id: string;
  status: string;
  last_synced_at: string | null;
  raw_transactions_synced_start_date: string | null;
  raw_transactions_synced_end_date: string | null;
}

interface PropertyTransactionClassificationRow {
  id: string;
  asset_id: string;
  raw_bank_transaction_id: string | null;
  bank_connection_id: string | null;
  provider_transaction_id: string;
  account_id: string;
  classification: RealEstateTransactionClassification | null;
  category: RealEstateExpenseCategory | null;
  rent_period_month: string | null;
  note: string | null;
  posted_at?: string;
  description?: string;
  original_description?: string | null;
  memo?: string | null;
  amount?: string | number;
  direction?: "credit" | "debit";
  account_name?: string;
}

interface RawBankTransactionRow {
  id: string;
  provider: "plaid";
  provider_item_id: string;
  provider_account_id: string;
  provider_transaction_id: string;
  bank_connection_id: string | null;
  account_name: string;
  posted_at: string;
  title: string;
  description: string;
  memo: string | null;
  amount: string | number;
  direction: "credit" | "debit";
}

interface PropertyTransactionReviewOwnerRow {
  asset_id: string;
  direction: "credit" | "debit";
  posted_at: string;
  rent_period_month: string | null;
}

export interface RentTransactionMatch {
  id: string;
  connectionId: string;
  rawBankTransactionId: string | null;
  postedAt: string;
  title: string;
  memo: string;
  description: string;
  amount: number;
  accountName: string;
  classification: RealEstateTransactionClassification | null;
  recordedTransactionId: string | null;
  rentPeriodMonth: string | null;
  amountMatchesTarget: boolean;
}

export interface ExpenseTransactionPreview {
  id: string;
  connectionId: string;
  rawBankTransactionId: string | null;
  postedAt: string;
  description: string;
  amount: number;
  accountName: string;
  classification: RealEstateTransactionClassification | null;
  recordedTransactionId: string | null;
}

export interface RentCreditSyncResult {
  affectedAssetIds: string[];
  autoMatchedCount: number;
  matchMonth: string;
  matches: RentTransactionMatch[];
  pendingReviewCount: number;
  provider: string;
  skippedBankSync: boolean;
  wroteLedgerRows: boolean;
}

export interface ExpenseTransactionSyncResult {
  affectedAssetIds: string[];
  pendingReviewCount: number;
  provider: string;
  reviewMonth: string;
  ruleMatchedCount: number;
  skippedBankSync: boolean;
  transactions: ExpenseTransactionPreview[];
  wroteLedgerRows: boolean;
}

export type MonthlyReviewCloseStatus =
  | "blocked"
  | "closed"
  | "would_close";

export interface RealEstateMonthlyReviewCloseResult {
  affectedAssetIds: string[];
  assessment: ReturnType<typeof getMonthlyReviewAssessment> | null;
  blockers: string[];
  coverageAssessment: RealEstateMonthlyDataCoverageAssessment | null;
  expenseSyncResult: ExpenseTransactionSyncResult | null;
  message: string;
  rentSyncResult: RentCreditSyncResult | null;
  status: MonthlyReviewCloseStatus;
  wroteLedgerRows: boolean;
}

function getMonthRange(monthStart: string): { startDate: string; endDate: string } {
  const start = new Date(`${monthStart}T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const endOfMonth = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  return {
    endDate: endOfMonth.toISOString().slice(0, 10),
    startDate: monthStart
  };
}

function getBufferedMonthRange(
  monthStart: string,
  bufferDays: number
): { startDate: string; endDate: string } {
  const start = new Date(`${monthStart}T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const bufferedStart = new Date(start.getTime() - bufferDays * 24 * 60 * 60 * 1000);
  const bufferedEnd = new Date(end.getTime() + (bufferDays - 1) * 24 * 60 * 60 * 1000);

  return {
    endDate: bufferedEnd.toISOString().slice(0, 10),
    startDate: bufferedStart.toISOString().slice(0, 10)
  };
}

function normalizeReviewMonthDate(reviewMonth: string): string {
  return /^\d{4}-\d{2}$/.test(reviewMonth) ? `${reviewMonth}-01` : reviewMonth;
}

function isReviewableRentCredit(transaction: BankTransaction): boolean {
  return (
    transaction.direction === "credit" &&
    transaction.amount >= MIN_RENT_CREDIT_REVIEW_AMOUNT
  );
}

function getPlaidItemGroupKey(
  connection: Pick<PropertyBankConnectionRow, "access_token" | "provider_item_id">
): string {
  return getPlaidItemConnectionKey(connection);
}

function getRawProviderItemId(
  connection: Pick<PropertyBankConnectionRow, "account_id" | "provider_item_id">
): string {
  return connection.provider_item_id?.trim() || `legacy:${connection.account_id}`;
}

function getRawBankTransactionKey({
  provider,
  providerAccountId,
  providerItemId,
  providerTransactionId
}: {
  provider: "plaid";
  providerAccountId: string;
  providerItemId: string;
  providerTransactionId: string;
}): string {
  return [
    provider,
    providerItemId,
    providerAccountId,
    providerTransactionId
  ].join("|");
}

function getRawBankTransactionKeyForConnection(
  connection: PropertyBankConnectionRow,
  transaction: BankTransaction
): string {
  return getRawBankTransactionKey({
    provider: "plaid",
    providerAccountId: connection.account_id,
    providerItemId: getRawProviderItemId(connection),
    providerTransactionId: transaction.id
  });
}

function getRawBankTransactionKeyForRow(row: RawBankTransactionRow): string {
  return getRawBankTransactionKey({
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    providerItemId: row.provider_item_id,
    providerTransactionId: row.provider_transaction_id
  });
}

function getLedgerBankConnectionId(transaction: BankTransaction): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    transaction.connectionId
  )
    ? transaction.connectionId
    : null;
}

function getTransactionClassificationKey({
  connectionId,
  accountId,
  transactionId
}: {
  connectionId: string | null;
  accountId: string;
  transactionId: string;
}): string {
  return `${connectionId ?? "mock"}:${accountId}:${transactionId}`;
}

function getBankTransactionClassification(
  classifications: Map<string, PropertyTransactionClassificationRow>,
  transaction: BankTransaction
): PropertyTransactionClassificationRow | null {
  if (transaction.rawBankTransactionId) {
    return classifications.get(`raw:${transaction.rawBankTransactionId}`) ?? null;
  }

  return (
    classifications.get(
      getTransactionClassificationKey({
        accountId: transaction.accountId,
        connectionId: getLedgerBankConnectionId(transaction),
        transactionId: transaction.id
      })
    ) ?? null
  );
}

function buildRawBankTransactionRow({
  connection,
  syncedAt,
  transaction
}: {
  connection: PropertyBankConnectionRow;
  syncedAt: string;
  transaction: BankTransaction;
}) {
  return {
    account_name: transaction.accountName,
    amount: transaction.amount,
    bank_connection_id: connection.id,
    description: transaction.description,
    direction: transaction.direction,
    memo: transaction.memo || null,
    posted_at: transaction.postedAt,
    provider: "plaid",
    provider_account_id: connection.account_id,
    provider_item_id: getRawProviderItemId(connection),
    provider_transaction_id: transaction.id,
    synced_at: syncedAt,
    title: transaction.title,
    updated_at: syncedAt
  };
}

function mapRawBankTransactionToBankTransaction(
  row: RawBankTransactionRow
): BankTransaction {
  return {
    accountId: row.provider_account_id,
    accountName: row.account_name,
    amount: Number(row.amount),
    connectionId: row.bank_connection_id ?? `raw:${row.id}`,
    description: row.description,
    direction: row.direction,
    id: row.provider_transaction_id,
    memo: row.memo ?? "",
    postedAt: row.posted_at,
    providerItemId: row.provider_item_id,
    rawBankTransactionId: row.id,
    title: row.title
  };
}

function hasFreshRawBankTransactionCoverage({
  connection,
  endDate,
  now,
  startDate
}: {
  connection: PropertyBankConnectionRow;
  endDate: string;
  now: Date;
  startDate: string;
}): boolean {
  if (!connection.last_synced_at) {
    return false;
  }

  const lastSyncedAt = new Date(connection.last_synced_at);

  if (
    !Number.isFinite(lastSyncedAt.getTime()) ||
    now.getTime() - lastSyncedAt.getTime() > RAW_BANK_TRANSACTION_STALE_MS
  ) {
    return false;
  }

  return (
    Boolean(connection.raw_transactions_synced_start_date) &&
    Boolean(connection.raw_transactions_synced_end_date) &&
    connection.raw_transactions_synced_start_date! <= startDate &&
    connection.raw_transactions_synced_end_date! >= endDate
  );
}

async function loadPropertyRentMatchInput(
  assetId: string
): Promise<PropertyRentMatchRow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_properties")
    .select("monthly_rent, rent_match_tolerance")
    .eq("asset_id", assetId)
    .single();

  if (error) {
    throw new Error(`Could not load rent matching settings: ${error.message}`);
  }

  return data as PropertyRentMatchRow;
}

async function loadPropertyBankConnections(
  assetId: string
): Promise<PropertyBankConnectionRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select(
      "id, provider, access_token, account_id, account_name, account_type, account_subtype, institution_name, institution_id, last_four, provider_item_id, status, last_synced_at, raw_transactions_synced_start_date, raw_transactions_synced_end_date"
    )
    .eq("asset_id", assetId)
    .eq("status", "active")
    .order("account_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load bank connections: ${error.message}`);
  }

  return (data ?? []) as PropertyBankConnectionRow[];
}

export async function isMonthlyReviewClosed({
  assetId,
  reviewMonth
}: {
  assetId: string;
  reviewMonth: string;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_monthly_reviews")
    .select("closed_at")
    .eq("asset_id", assetId)
    .eq("review_month", normalizeReviewMonthDate(reviewMonth))
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check monthly review status: ${error.message}`);
  }

  return Boolean((data as { closed_at: string | null } | null)?.closed_at);
}

async function assertMonthlyReviewIsOpen({
  assetId,
  reviewMonth
}: {
  assetId: string;
  reviewMonth: string;
}) {
  if (await isMonthlyReviewClosed({ assetId, reviewMonth })) {
    throw new Error("Reopen this monthly review before changing transactions.");
  }
}

function getPropertyTransactionReviewMonth(
  transaction: Pick<
    PropertyTransactionReviewOwnerRow,
    "direction" | "posted_at" | "rent_period_month"
  >
): string {
  const reviewDate =
    transaction.direction === "credit"
      ? (transaction.rent_period_month ?? transaction.posted_at)
      : transaction.posted_at;

  return `${reviewDate.slice(0, 7)}-01`;
}

async function assertPropertyTransactionOwnerReviewIsOpen(
  transaction: PropertyTransactionReviewOwnerRow
) {
  await assertMonthlyReviewIsOpen({
    assetId: transaction.asset_id,
    reviewMonth: getPropertyTransactionReviewMonth(transaction)
  });
}

async function assertRawBankTransactionCanBeClassified({
  classification,
  rawBankTransactionId,
  targetAssetId
}: {
  classification: RealEstateTransactionClassification;
  rawBankTransactionId: string;
  targetAssetId: string;
}) {
  if (!rawBankTransactionId) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .select("asset_id, classification, direction, posted_at, rent_period_month")
    .eq("raw_bank_transaction_id", rawBankTransactionId);

  if (error) {
    throw new Error(`Could not check existing ledger owner: ${error.message}`);
  }

  for (const row of (data ?? []) as Array<
    PropertyTransactionReviewOwnerRow & {
      classification: RealEstateTransactionClassification | null;
    }
  >) {
    if (row.asset_id === targetAssetId) {
      await assertPropertyTransactionOwnerReviewIsOpen(row);
      continue;
    }

    if (
      isRawBankTransactionClaimingClassification(classification) &&
      isRawBankTransactionClaimingClassification(row.classification)
    ) {
      throw new Error("This bank transaction is already recorded for another property.");
    }
  }
}

async function updatePlaidConnectionGroup({
  connection,
  lastSyncedAt,
  syncedEndDate,
  syncedStartDate,
  status,
  updatedAt
}: {
  connection: PropertyBankConnectionRow;
  lastSyncedAt?: string;
  syncedEndDate?: string;
  syncedStartDate?: string;
  status: "active" | "disconnected";
  updatedAt: string;
}) {
  const supabase = createServerSupabaseClient();
  const shouldScopeSyncMetadataToAccount = Boolean(
    lastSyncedAt || syncedStartDate || syncedEndDate
  );
  const updatePayload: {
    last_synced_at?: string;
    raw_transactions_synced_end_date?: string;
    raw_transactions_synced_start_date?: string;
    status: "active" | "disconnected";
    updated_at: string;
  } = {
    status,
    updated_at: updatedAt
  };

  if (lastSyncedAt) {
    updatePayload.last_synced_at = lastSyncedAt;
  }

  if (syncedStartDate) {
    updatePayload.raw_transactions_synced_start_date = syncedStartDate;
  }

  if (syncedEndDate) {
    updatePayload.raw_transactions_synced_end_date = syncedEndDate;
  }

  let query = supabase
    .from("real_estate_bank_connections")
    .update(updatePayload)
    .eq("provider", "plaid");

  if (connection.provider_item_id) {
    query = query.eq("provider_item_id", connection.provider_item_id);
  } else {
    query = query.eq("access_token", connection.access_token);
  }

  if (shouldScopeSyncMetadataToAccount) {
    query = query.eq("account_id", connection.account_id);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Could not update Plaid connection status: ${error.message}`);
  }
}

async function upsertRawBankTransactions({
  connectionTransactions,
  syncedAt
}: {
  connectionTransactions: Array<{
    connection: PropertyBankConnectionRow;
    transactions: BankTransaction[];
  }>;
  syncedAt: string;
}): Promise<Map<string, RawBankTransactionRow>> {
  const rowsByKey = new Map<string, ReturnType<typeof buildRawBankTransactionRow>>();

  connectionTransactions.forEach(({ connection, transactions }) => {
    transactions.forEach((transaction) => {
      rowsByKey.set(
        getRawBankTransactionKeyForConnection(connection, transaction),
        buildRawBankTransactionRow({
          connection,
          syncedAt,
          transaction
        })
      );
    });
  });

  const rows = Array.from(rowsByKey.values());

  if (rows.length === 0) {
    return new Map();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_raw_bank_transactions")
    .upsert(rows, {
      onConflict:
        "provider,provider_item_id,provider_account_id,provider_transaction_id"
    })
    .select(
      "id, provider, provider_item_id, provider_account_id, provider_transaction_id, bank_connection_id, account_name, posted_at, title, description, memo, amount, direction"
    );

  if (error) {
    throw new Error(`Could not save raw bank transactions: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as RawBankTransactionRow[]).map((row) => [
      getRawBankTransactionKeyForRow(row),
      row
    ])
  );
}

async function fetchLiveConnectedPropertyBankTransactions({
  connections,
  startDate,
  endDate,
  expectedRentAmount
}: {
  connections: PropertyBankConnectionRow[];
  startDate: string;
  endDate: string;
  expectedRentAmount?: number;
}) {
  const transactionGroups = await Promise.all(
    connections.map((connection) => {
      if (connection.provider !== "plaid") {
        throw new Error(`Unsupported bank connection provider: ${connection.provider}.`);
      }

      return fetchBankTransactions({
        bankConnectionId: connection.id,
        bankProvider: "plaid",
        endDate,
        expectedRentAmount,
        plaidAccessToken: connection.access_token,
        plaidAccountId: connection.account_id,
        plaidAccountName: connection.account_name,
        plaidProviderItemId: getRawProviderItemId(connection),
        startDate
      });
    })
  );

  return {
    provider:
      transactionGroups.find((group) => group.provider === "plaid")?.provider ?? "plaid",
    transactions: transactionGroups.flatMap((group) => group.transactions)
  };
}

async function syncPlaidRawBankTransactionsForConnections({
  connections,
  endDate,
  expectedRentAmount,
  startDate,
  syncedAt
}: {
  connections: PropertyBankConnectionRow[];
  endDate: string;
  expectedRentAmount?: number;
  startDate: string;
  syncedAt: string;
}): Promise<{
  disconnectedItemKeys: string[];
  fetchedCount: number;
}> {
  const disconnectedItemKeys = new Set<string>();
  const connectionsToFetch = getUniquePlaidAccountConnections(connections);
  const connectionTransactions = await Promise.all(
    connectionsToFetch.map(async (connection) => {
      try {
        const result = await fetchLiveConnectedPropertyBankTransactions({
          connections: [connection],
          endDate,
          expectedRentAmount,
          startDate
        });

        return {
          connection,
          transactions: result.transactions
        };
      } catch (error) {
        if (error instanceof PlaidItemDisconnectedError) {
          await updatePlaidConnectionGroup({
            connection,
            status: "disconnected",
            updatedAt: syncedAt
          });
          disconnectedItemKeys.add(getPlaidItemGroupKey(connection));

          return null;
        }

        throw error;
      }
    })
  );
  const successfulConnectionTransactions = connectionTransactions.filter(
    (
      group
    ): group is {
      connection: PropertyBankConnectionRow;
      transactions: BankTransaction[];
    } => Boolean(group)
  );

  await upsertRawBankTransactions({
    connectionTransactions: successfulConnectionTransactions,
    syncedAt
  });

  await Promise.all(
    successfulConnectionTransactions.map(({ connection }) =>
      updatePlaidConnectionGroup({
        connection,
        lastSyncedAt: syncedAt,
        syncedEndDate: endDate,
        syncedStartDate: startDate,
        status: "active",
        updatedAt: syncedAt
      })
    )
  );

  return {
    disconnectedItemKeys: Array.from(disconnectedItemKeys),
    fetchedCount: successfulConnectionTransactions.reduce(
      (count, group) => count + group.transactions.length,
      0
    )
  };
}

async function loadRawBankTransactionsForConnections({
  connections,
  endDate,
  startDate
}: {
  connections: PropertyBankConnectionRow[];
  endDate: string;
  startDate: string;
}): Promise<BankTransaction[]> {
  const connectionKeys = new Set(
    connections.map((connection) =>
      getRawBankTransactionKey({
        provider: "plaid",
        providerAccountId: connection.account_id,
        providerItemId: getRawProviderItemId(connection),
        providerTransactionId: ""
      })
    )
  );

  if (connectionKeys.size === 0) {
    return [];
  }

  const providerItemIds = Array.from(
    new Set(connections.map((connection) => getRawProviderItemId(connection)))
  );
  const providerAccountIds = Array.from(
    new Set(connections.map((connection) => connection.account_id))
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_raw_bank_transactions")
    .select(
      "id, provider, provider_item_id, provider_account_id, provider_transaction_id, bank_connection_id, account_name, posted_at, title, description, memo, amount, direction"
    )
    .eq("provider", "plaid")
    .in("provider_item_id", providerItemIds)
    .in("provider_account_id", providerAccountIds)
    .gte("posted_at", startDate)
    .lte("posted_at", endDate)
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load raw bank transactions: ${error.message}`);
  }

  return ((data ?? []) as RawBankTransactionRow[])
    .filter((row) =>
      connectionKeys.has(
        getRawBankTransactionKey({
          provider: row.provider,
          providerAccountId: row.provider_account_id,
          providerItemId: row.provider_item_id,
          providerTransactionId: ""
        })
      )
    )
    .map(mapRawBankTransactionToBankTransaction);
}

async function fetchConnectedPropertyBankTransactions({
  connections,
  startDate,
  endDate,
  expectedRentAmount
}: {
  connections: PropertyBankConnectionRow[];
  startDate: string;
  endDate: string;
  expectedRentAmount?: number;
}) {
  const now = new Date();
  const connectionsNeedingRefresh = connections.filter(
    (connection) =>
      connection.provider === "plaid" &&
      !hasFreshRawBankTransactionCoverage({
        connection,
        endDate,
        now,
        startDate
      })
  );
  let usableConnections = connections;

  if (connectionsNeedingRefresh.length > 0) {
    const syncResult = await syncPlaidRawBankTransactionsForConnections({
      connections: connectionsNeedingRefresh,
      endDate,
      expectedRentAmount,
      startDate,
      syncedAt: now.toISOString()
    });
    const disconnectedItemKeys = new Set(syncResult.disconnectedItemKeys);

    usableConnections = connections.filter(
      (connection) => !disconnectedItemKeys.has(getPlaidItemGroupKey(connection))
    );
  }

  return {
    provider: "plaid" as const,
    transactions: await loadRawBankTransactionsForConnections({
      connections: usableConnections,
      endDate,
      startDate
    })
  };
}

async function fetchPropertyConnectedBankTransactions({
  assetId,
  startDate,
  endDate,
  expectedRentAmount
}: {
  assetId: string;
  startDate: string;
  endDate: string;
  expectedRentAmount?: number;
}) {
  const connections = await loadPropertyBankConnections(assetId);

  if (connections.length === 0) {
    return null;
  }

  return fetchConnectedPropertyBankTransactions({
    connections,
    endDate,
    expectedRentAmount,
    startDate
  });
}

async function loadPropertyTransactionClassifications({
  assetId,
  startDate,
  endDate
}: {
  assetId: string;
  startDate: string;
  endDate: string;
}): Promise<Map<string, PropertyTransactionClassificationRow>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .select(
      `
      id,
      asset_id,
      raw_bank_transaction_id,
      bank_connection_id,
      provider_transaction_id,
      account_id,
      account_name,
      posted_at,
      description,
      original_description,
      memo,
      amount,
      direction,
      classification,
      category,
      rent_period_month,
      note
    `
    )
    .eq("asset_id", assetId)
    .gte("posted_at", startDate)
    .lte("posted_at", endDate);

  if (error) {
    throw new Error(`Could not load property transaction ledger: ${error.message}`);
  }

  const rows = (data ?? []) as PropertyTransactionClassificationRow[];

  return new Map(
    rows.map((row) => {
      const key = row.raw_bank_transaction_id
        ? `raw:${row.raw_bank_transaction_id}`
        : getTransactionClassificationKey({
            accountId: row.account_id,
            connectionId: row.bank_connection_id,
            transactionId: row.provider_transaction_id
          });

      return [key, row] as [string, PropertyTransactionClassificationRow];
    })
  );
}

async function hasClassifiedRentalIncomeForReviewMonth({
  assetId,
  reviewMonth
}: {
  assetId: string;
  reviewMonth: string;
}): Promise<boolean> {
  const reviewMonthPrefix = reviewMonth.slice(0, 7);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .select("posted_at, rent_period_month")
    .eq("asset_id", assetId)
    .eq("direction", "credit")
    .eq("classification", "rental_income");

  if (error) {
    throw new Error(`Could not load rent income ledger: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    posted_at: string;
    rent_period_month: string | null;
  }>).some((transaction) => {
    const recognitionMonth = transaction.rent_period_month ?? transaction.posted_at;

    return recognitionMonth.slice(0, 7) === reviewMonthPrefix;
  });
}

async function loadClaimedRawBankTransactionIds({
  assetId,
  rawBankTransactionIds
}: {
  assetId: string;
  rawBankTransactionIds: string[];
}): Promise<Set<string>> {
  const uniqueRawIds = Array.from(new Set(rawBankTransactionIds));

  if (uniqueRawIds.length === 0) {
    return new Set();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .select("raw_bank_transaction_id, asset_id, classification")
    .in("raw_bank_transaction_id", uniqueRawIds);

  if (error) {
    throw new Error(`Could not load assigned bank transactions: ${error.message}`);
  }

  return getClaimedRawBankTransactionIdsForOtherAssets({
    assetId,
    rows: (data ?? []) as Array<{
      asset_id: string;
      classification: RealEstateTransactionClassification | null;
      raw_bank_transaction_id: string | null;
    }>
  });
}

async function filterTransactionsOwnedByCurrentProperty({
  assetId,
  transactions
}: {
  assetId: string;
  transactions: BankTransaction[];
}): Promise<BankTransaction[]> {
  const claimedRawIds = await loadClaimedRawBankTransactionIds({
    assetId,
    rawBankTransactionIds: transactions
      .map((transaction) => transaction.rawBankTransactionId)
      .filter((id): id is string => Boolean(id))
  });

  if (claimedRawIds.size === 0) {
    return transactions;
  }

  return transactions.filter(
    (transaction) =>
      !transaction.rawBankTransactionId ||
      !claimedRawIds.has(transaction.rawBankTransactionId)
  );
}

async function ignoreSourcePendingTransactionsClaimedByOtherAssets({
  assetId,
  direction,
  rawBankTransactionIds,
  updatedAt
}: {
  assetId: string;
  direction: "credit" | "debit";
  rawBankTransactionIds: string[];
  updatedAt: string;
}): Promise<number> {
  const uniqueRawIds = Array.from(new Set(rawBankTransactionIds));

  if (uniqueRawIds.length === 0) {
    return 0;
  }

  const supabase = createServerSupabaseClient();
  const { data: ownershipRows, error: ownershipError } = await supabase
    .from("real_estate_property_transactions")
    .select("raw_bank_transaction_id, asset_id, classification, description")
    .in("raw_bank_transaction_id", uniqueRawIds);

  if (ownershipError) {
    throw new Error(
      `Could not load shared transaction ownership: ${ownershipError.message}`
    );
  }

  const sourcePendingRawIds = getPendingRawBankTransactionIdsClaimedByOtherAssets({
    assetId,
    rows: (ownershipRows ?? []) as Array<{
      asset_id: string;
      classification: RealEstateTransactionClassification | null;
      description: string | null;
      raw_bank_transaction_id: string | null;
    }>
  });
  const cleanupDescriptionsByRawId =
    getPendingRawBankTransactionCleanupDescriptionsByRawId({
      assetId,
      rows: (ownershipRows ?? []) as Array<{
        asset_id: string;
        classification: RealEstateTransactionClassification | null;
        description: string | null;
        raw_bank_transaction_id: string | null;
      }>
    });

  if (sourcePendingRawIds.size === 0) {
    return 0;
  }

  let updatedCount = 0;

  for (const rawBankTransactionId of sourcePendingRawIds) {
    const claimedDescription = cleanupDescriptionsByRawId.get(rawBankTransactionId);
    const updateValues: {
      category: null;
      classification: "ignored";
      description?: string;
      note: null;
      updated_at: string;
    } = {
      category: null,
      classification: "ignored",
      note: null,
      updated_at: updatedAt
    };

    if (claimedDescription) {
      updateValues.description = claimedDescription;
    }

    const { data, error } = await supabase
      .from("real_estate_property_transactions")
      .update(updateValues)
      .eq("asset_id", assetId)
      .eq("direction", direction)
      .is("classification", null)
      .eq("raw_bank_transaction_id", rawBankTransactionId)
      .select("id");

    if (error) {
      throw new Error(`Could not ignore source pending transactions: ${error.message}`);
    }

    updatedCount += data?.length ?? 0;
  }

  return updatedCount;
}

async function ignoreOtherPendingRowsForClaimedRawTransaction({
  assetId,
  classification,
  description,
  direction,
  rawBankTransactionId,
  updatedAt
}: {
  assetId: string;
  classification: RealEstateTransactionClassification;
  description?: string | null;
  direction: "credit" | "debit";
  rawBankTransactionId: string | null | undefined;
  updatedAt: string;
}): Promise<string[]> {
  if (
    !rawBankTransactionId ||
    !isRawBankTransactionClaimingClassification(classification)
  ) {
    return [];
  }

  const cleanedDescription = description?.trim() || null;
  const updateValues: {
    category: null;
    classification: "ignored";
    description?: string;
    note: null;
    updated_at: string;
  } = {
    category: null,
    classification: "ignored",
    note: null,
    updated_at: updatedAt
  };

  if (cleanedDescription) {
    updateValues.description = cleanedDescription;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .update(updateValues)
    .eq("raw_bank_transaction_id", rawBankTransactionId)
    .neq("asset_id", assetId)
    .eq("direction", direction)
    .is("classification", null)
    .select("asset_id");

  if (error) {
    throw new Error(`Could not ignore shared pending transactions: ${error.message}`);
  }

  return Array.from(
    new Set(((data ?? []) as Array<{ asset_id: string }>).map((row) => row.asset_id))
  );
}

async function ignoreUnreviewedRentCreditsClaimedByOtherAssets({
  assetId,
  provider,
  rentPeriodMonth,
  transactions,
  updatedAt
}: {
  assetId: string;
  provider: BankTransactionProviderName;
  rentPeriodMonth: string;
  transactions: BankTransaction[];
  updatedAt: string;
}): Promise<number> {
  const reviewableTransactions = transactions.filter(
    (transaction) => transaction.rawBankTransactionId && isReviewableRentCredit(transaction)
  );
  const uniqueRawIds = Array.from(
    new Set(
      reviewableTransactions
        .map((transaction) => transaction.rawBankTransactionId)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (uniqueRawIds.length === 0) {
    return 0;
  }

  const supabase = createServerSupabaseClient();
  const { data: ownershipRows, error: ownershipError } = await supabase
    .from("real_estate_property_transactions")
    .select("raw_bank_transaction_id, asset_id, classification, description")
    .in("raw_bank_transaction_id", uniqueRawIds);

  if (ownershipError) {
    throw new Error(
      `Could not load shared rent credit ownership: ${ownershipError.message}`
    );
  }

  const claimDescriptionsByRawId =
    getUnreviewedRawBankTransactionClaimDescriptionsByRawId({
      assetId,
      rows: (ownershipRows ?? []) as Array<{
        asset_id: string;
        classification: RealEstateTransactionClassification | null;
        description: string | null;
        raw_bank_transaction_id: string | null;
      }>
    });

  if (claimDescriptionsByRawId.size === 0) {
    return 0;
  }

  const seenRawIds = new Set<string>();
  const ignoredRows: PropertyTransactionLedgerUpsertRow[] = [];

  reviewableTransactions.forEach((transaction) => {
    const rawBankTransactionId = transaction.rawBankTransactionId;

    if (
      !rawBankTransactionId ||
      seenRawIds.has(rawBankTransactionId) ||
      !claimDescriptionsByRawId.has(rawBankTransactionId)
    ) {
      return;
    }

    seenRawIds.add(rawBankTransactionId);
    ignoredRows.push(
      buildPropertyTransactionLedgerRow({
        assetId,
        category: null,
        classification: "ignored",
        description: claimDescriptionsByRawId.get(rawBankTransactionId),
        note: null,
        provider,
        rentPeriodMonth,
        transaction,
        updatedAt
      })
    );
  });

  if (ignoredRows.length === 0) {
    return 0;
  }

  await upsertPropertyTransactionLedgerRows(
    ignoredRows,
    "Could not save ignored shared rent credits"
  );

  return ignoredRows.length;
}

function buildPropertyTransactionLedgerRow({
  assetId,
  category,
  classification,
  description,
  note,
  provider,
  rentPeriodMonth,
  transaction,
  updatedAt
}: {
  assetId: string;
  category: RealEstateExpenseCategory | null;
  classification: RealEstateTransactionClassification | null;
  description?: string | null;
  note: string | null;
  provider: BankTransactionProviderName;
  rentPeriodMonth: string | null;
  transaction: BankTransaction;
  updatedAt: string;
}) {
  return {
    account_id: transaction.accountId,
    account_name: transaction.accountName,
    amount: transaction.amount,
    asset_id: assetId,
    bank_connection_id: getLedgerBankConnectionId(transaction),
    category,
    classification,
    description: description || transaction.description,
    direction: transaction.direction,
    memo: transaction.memo || null,
    note,
    original_description: transaction.description,
    posted_at: transaction.postedAt,
    provider,
    provider_transaction_id: transaction.id,
    raw_bank_transaction_id: transaction.rawBankTransactionId ?? null,
    rent_period_month: rentPeriodMonth,
    updated_at: updatedAt
  };
}

type PropertyTransactionLedgerUpsertRow = ReturnType<
  typeof buildPropertyTransactionLedgerRow
>;

async function upsertPropertyTransactionLedgerRows(
  rows: PropertyTransactionLedgerUpsertRow[],
  errorContext: string
) {
  if (rows.length === 0) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const rawRows = rows.filter((row) => row.raw_bank_transaction_id);
  const legacyRows = rows.filter((row) => !row.raw_bank_transaction_id);

  if (rawRows.length > 0) {
    const { error } = await supabase
      .from("real_estate_property_transactions")
      .upsert(rawRows, {
        onConflict: "asset_id,raw_bank_transaction_id"
      });

    if (error) {
      throw new Error(`${errorContext}: ${error.message}`);
    }
  }

  if (legacyRows.length > 0) {
    const { error } = await supabase
      .from("real_estate_property_transactions")
      .upsert(legacyRows, {
        onConflict: "asset_id,provider,account_id,provider_transaction_id"
      });

    if (error) {
      throw new Error(`${errorContext}: ${error.message}`);
    }
  }
}

function getMatchingExpenseRule({
  rules,
  transaction
}: {
  rules: Awaited<ReturnType<typeof getActiveRealEstateTransactionRules>>;
  transaction: BankTransaction;
}) {
  return findMatchingTransactionRule(rules, {
    amount: transaction.amount,
    description: transaction.description,
    direction: transaction.direction
  });
}

export async function syncRentCreditsForReviewMonth({
  assetId,
  matchMonth
}: {
  assetId: string;
  matchMonth: string;
}): Promise<RentCreditSyncResult> {
  const property = await loadPropertyRentMatchInput(assetId);
  const expectedAmount = Number(property.monthly_rent);
  const tolerance = Number(property.rent_match_tolerance);

  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw new Error("Monthly rent must be greater than zero before matching transactions.");
  }

  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("Rent matching tolerance must be zero or greater.");
  }

  const hasExistingRentalIncome = await hasClassifiedRentalIncomeForReviewMonth({
    assetId,
    reviewMonth: matchMonth
  });
  const { startDate, endDate } = hasExistingRentalIncome
    ? getMonthRange(matchMonth)
    : getBufferedMonthRange(matchMonth, RENT_TRANSACTION_SEARCH_BUFFER_DAYS);
  const transactionResult = await fetchPropertyConnectedBankTransactions({
    assetId,
    endDate,
    expectedRentAmount: expectedAmount,
    startDate
  });

  if (!transactionResult) {
    return {
      affectedAssetIds: [],
      autoMatchedCount: 0,
      matchMonth: matchMonth.slice(0, 7),
      matches: [],
      pendingReviewCount: 0,
      provider: "",
      skippedBankSync: true,
      wroteLedgerRows: false
    };
  }

  let wroteLedgerRows = false;
  const affectedAssetIds = new Set<string>();
  const sourceCleanupCount =
    await ignoreSourcePendingTransactionsClaimedByOtherAssets({
      assetId,
      direction: "credit",
      rawBankTransactionIds: transactionResult.transactions
        .map((transaction) => transaction.rawBankTransactionId)
        .filter((id): id is string => Boolean(id)),
      updatedAt: new Date().toISOString()
    });

  if (sourceCleanupCount > 0) {
    wroteLedgerRows = true;
    affectedAssetIds.add(assetId);
  }

  const availableTransactions = await filterTransactionsOwnedByCurrentProperty({
    assetId,
    transactions: transactionResult.transactions
  });
  let classifications = await loadPropertyTransactionClassifications({
    assetId,
    endDate,
    startDate
  });
  let decisions = getMonthlyRentCreditSyncDecisions({
    expectedAmount,
    getClassification: (transaction) =>
      getBankTransactionClassification(classifications, transaction),
    minimumAmount: MIN_RENT_CREDIT_REVIEW_AMOUNT,
    reviewMonth: matchMonth,
    tolerance,
    transactions: availableTransactions
  });
  const autoMatchedDecisions = decisions.filter(
    (decision) => decision.shouldAutoRecordRentalIncome
  );
  let hasRentalIncomeForReviewMonth =
    hasExistingRentalIncome || autoMatchedDecisions.length > 0;

  if (autoMatchedDecisions.length > 0) {
    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      autoMatchedDecisions.map((decision) =>
        buildPropertyTransactionLedgerRow({
          assetId,
          category: null,
          classification: "rental_income",
          note: null,
          provider: transactionResult.provider,
          rentPeriodMonth: matchMonth,
          transaction: decision.transaction,
          updatedAt: now
        })
      ),
      "Could not auto-record rental income"
    );

    wroteLedgerRows = true;
    affectedAssetIds.add(assetId);
    for (const decision of autoMatchedDecisions) {
      const cleanupAffectedAssetIds =
        await ignoreOtherPendingRowsForClaimedRawTransaction({
          assetId,
          classification: "rental_income",
          description: decision.transaction.description,
          direction: "credit",
          rawBankTransactionId: decision.transaction.rawBankTransactionId,
          updatedAt: now
        });

      cleanupAffectedAssetIds.forEach((affectedAssetId) => {
        affectedAssetIds.add(affectedAssetId);
      });
    }

    classifications = await loadPropertyTransactionClassifications({
      assetId,
      endDate,
      startDate
    });
    decisions = getMonthlyRentCreditSyncDecisions({
      expectedAmount,
      getClassification: (transaction) =>
        getBankTransactionClassification(classifications, transaction),
      minimumAmount: MIN_RENT_CREDIT_REVIEW_AMOUNT,
      reviewMonth: matchMonth,
      tolerance,
      transactions: availableTransactions
    });
    hasRentalIncomeForReviewMonth = true;
  }

  const sharedIgnoredTransactions = hasRentalIncomeForReviewMonth
    ? transactionResult.transactions.filter(
        (transaction) => transaction.postedAt.slice(0, 7) === matchMonth.slice(0, 7)
      )
    : transactionResult.transactions;
  const sharedIgnoredCount =
    await ignoreUnreviewedRentCreditsClaimedByOtherAssets({
      assetId,
      provider: transactionResult.provider,
      rentPeriodMonth: matchMonth,
      transactions: sharedIgnoredTransactions,
      updatedAt: new Date().toISOString()
    });

  if (sharedIgnoredCount > 0) {
    wroteLedgerRows = true;
    affectedAssetIds.add(assetId);
  }

  const scopedDecisions = filterRentCreditDecisionsForReviewScope({
    decisions,
    reviewMonth: matchMonth,
    useBufferedFallback: !hasRentalIncomeForReviewMonth
  });
  const pendingDecisions = scopedDecisions.filter(
    (decision) => decision.shouldCreatePendingReview
  );

  if (pendingDecisions.length > 0) {
    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      pendingDecisions.map((decision) =>
        buildPropertyTransactionLedgerRow({
          assetId,
          category: null,
          classification: null,
          note: null,
          provider: transactionResult.provider,
          rentPeriodMonth: matchMonth,
          transaction: decision.transaction,
          updatedAt: now
        })
      ),
      "Could not save pending rent credits"
    );

    wroteLedgerRows = true;
    affectedAssetIds.add(assetId);
  }

  const matches = scopedDecisions.map((decision) => ({
    accountName: decision.transaction.accountName,
    amount: decision.transaction.amount,
    amountMatchesTarget: decision.amountMatchesTarget,
    classification: decision.classification?.classification ?? null,
    connectionId: decision.transaction.connectionId,
    description: decision.transaction.description,
    id: decision.transaction.id,
    memo: decision.transaction.memo,
    postedAt: decision.transaction.postedAt,
    rawBankTransactionId: decision.transaction.rawBankTransactionId ?? null,
    recordedTransactionId: decision.classification?.id ?? null,
    rentPeriodMonth: decision.rentPeriodMonth,
    title: decision.transaction.title
  }));

  return {
    affectedAssetIds: Array.from(affectedAssetIds),
    autoMatchedCount: autoMatchedDecisions.length,
    matchMonth: matchMonth.slice(0, 7),
    matches,
    pendingReviewCount: matches.filter((match) => !match.classification).length,
    provider: transactionResult.provider,
    skippedBankSync: false,
    wroteLedgerRows
  };
}

export async function syncExpenseTransactionsForReviewMonth({
  assetId,
  reviewMonth
}: {
  assetId: string;
  reviewMonth: string;
}): Promise<ExpenseTransactionSyncResult> {
  const { startDate, endDate } = getMonthRange(reviewMonth);
  const transactionResult = await fetchPropertyConnectedBankTransactions({
    assetId,
    endDate,
    startDate
  });

  if (!transactionResult) {
    return {
      affectedAssetIds: [],
      pendingReviewCount: 0,
      provider: "",
      reviewMonth: reviewMonth.slice(0, 7),
      ruleMatchedCount: 0,
      skippedBankSync: true,
      transactions: [],
      wroteLedgerRows: false
    };
  }

  const affectedAssetIds = new Set<string>();
  let wroteLedgerRows = false;
  const sourceCleanupCount =
    await ignoreSourcePendingTransactionsClaimedByOtherAssets({
      assetId,
      direction: "debit",
      rawBankTransactionIds: transactionResult.transactions
        .map((transaction) => transaction.rawBankTransactionId)
        .filter((id): id is string => Boolean(id)),
      updatedAt: new Date().toISOString()
    });

  if (sourceCleanupCount > 0) {
    wroteLedgerRows = true;
    affectedAssetIds.add(assetId);
  }

  const availableTransactions = await filterTransactionsOwnedByCurrentProperty({
    assetId,
    transactions: transactionResult.transactions
  });
  const classifications = await loadPropertyTransactionClassifications({
    assetId,
    endDate,
    startDate
  });
  const rules = await getActiveRealEstateTransactionRules();
  const decisions = getMonthlyExpenseDebitSyncDecisions({
    getClassification: (transaction) =>
      getBankTransactionClassification(classifications, transaction),
    getRuleMatch: (transaction) => {
      const matchingRule = getMatchingExpenseRule({
        rules,
        transaction
      });

      return matchingRule
        ? {
            assignedAssetId: matchingRule.assignedAssetId,
            category: matchingRule.category,
            id: matchingRule.id,
            name: matchingRule.name,
            transactionName: matchingRule.setTransactionName?.trim() || null
          }
        : null;
    },
    transactions: availableTransactions
  });
  const ruleMatchedDecisions = decisions.filter(
    (decision) => decision.shouldAutoRecordExpense
  );
  const pendingDecisions = decisions.filter(
    (decision) => decision.shouldCreatePendingReview
  );

  if (ruleMatchedDecisions.length > 0) {
    const now = new Date().toISOString();
    const ruleLedgerRows: PropertyTransactionLedgerUpsertRow[] = [];
    const claimedRuleTransactions: Array<{
      assetId: string;
      description: string;
      rawBankTransactionId: string | null | undefined;
    }> = [];

    for (const decision of ruleMatchedDecisions) {
      const ruleMatch = decision.ruleMatch;

      if (!ruleMatch) {
        throw new Error("Missing transaction rule match.");
      }

      const targetAssetId = ruleMatch.assignedAssetId ?? assetId;

      if (targetAssetId !== assetId) {
        await assertMonthlyReviewIsOpen({
          assetId: targetAssetId,
          reviewMonth
        });
      }

      if (decision.transaction.rawBankTransactionId) {
        await assertRawBankTransactionCanBeClassified({
          classification: "expense",
          rawBankTransactionId: decision.transaction.rawBankTransactionId,
          targetAssetId
        });
      }

      ruleLedgerRows.push(
        buildPropertyTransactionLedgerRow({
          assetId: targetAssetId,
          category: ruleMatch.category,
          classification: "expense",
          description: ruleMatch.transactionName,
          note: null,
          provider: transactionResult.provider,
          rentPeriodMonth: null,
          transaction: decision.transaction,
          updatedAt: now
        })
      );
      claimedRuleTransactions.push({
        assetId: targetAssetId,
        description: ruleMatch.transactionName || decision.transaction.description,
        rawBankTransactionId: decision.transaction.rawBankTransactionId
      });
      affectedAssetIds.add(targetAssetId);

      if (targetAssetId !== assetId) {
        ruleLedgerRows.push(
          buildPropertyTransactionLedgerRow({
            assetId,
            category: null,
            classification: "ignored",
            description: ruleMatch.transactionName,
            note: null,
            provider: transactionResult.provider,
            rentPeriodMonth: null,
            transaction: decision.transaction,
            updatedAt: now
          })
        );
        affectedAssetIds.add(assetId);
      }
    }

    await upsertPropertyTransactionLedgerRows(
      ruleLedgerRows,
      "Could not apply transaction rules"
    );

    wroteLedgerRows = true;
    for (const transaction of claimedRuleTransactions) {
      const cleanupAffectedAssetIds =
        await ignoreOtherPendingRowsForClaimedRawTransaction({
          assetId: transaction.assetId,
          classification: "expense",
          description: transaction.description,
          direction: "debit",
          rawBankTransactionId: transaction.rawBankTransactionId,
          updatedAt: now
        });

      cleanupAffectedAssetIds.forEach((affectedAssetId) => {
        affectedAssetIds.add(affectedAssetId);
      });
    }
  }

  if (pendingDecisions.length > 0) {
    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      pendingDecisions.map((decision) =>
        buildPropertyTransactionLedgerRow({
          assetId,
          category: null,
          classification: null,
          note: null,
          provider: transactionResult.provider,
          rentPeriodMonth: null,
          transaction: decision.transaction,
          updatedAt: now
        })
      ),
      "Could not save pending expense transactions"
    );

    wroteLedgerRows = true;
    affectedAssetIds.add(assetId);
  }

  const transactions = decisions
    .filter((decision) => decision.shouldShowAsUnclassified)
    .map((decision) => ({
      accountName: decision.transaction.accountName,
      amount: decision.transaction.amount,
      classification: null,
      connectionId: decision.transaction.connectionId,
      description: decision.transaction.description,
      id: decision.transaction.id,
      postedAt: decision.transaction.postedAt,
      rawBankTransactionId: decision.transaction.rawBankTransactionId ?? null,
      recordedTransactionId: decision.classification?.id ?? null
    }));

  return {
    affectedAssetIds: Array.from(affectedAssetIds),
    pendingReviewCount: transactions.length,
    provider: transactionResult.provider,
    reviewMonth: reviewMonth.slice(0, 7),
    ruleMatchedCount: ruleMatchedDecisions.length,
    skippedBankSync: false,
    transactions,
    wroteLedgerRows
  };
}

export function getMonthlyReviewCloseBlockers(
  assessment: ReturnType<typeof getMonthlyReviewAssessment>
): string[] {
  return [
    !assessment.isReviewMonthComplete ? "review month is still in progress" : "",
    assessment.rentStatus === "needs_review" ? "rent not ready" : "",
    assessment.unclassifiedRentCreditCount > 0
      ? `${assessment.unclassifiedRentCreditCount} rent ${assessment.unclassifiedRentCreditCount === 1 ? "credit needs" : "credits need"} review`
      : "",
    assessment.unclassifiedExpenseCount > 0
      ? `${assessment.unclassifiedExpenseCount} expense ${assessment.unclassifiedExpenseCount === 1 ? "transaction needs" : "transactions need"} review`
      : "",
    assessment.missingExpenseCategoryCount > 0
      ? `${assessment.missingExpenseCategoryCount} expense ${assessment.missingExpenseCategoryCount === 1 ? "transaction is" : "transactions are"} missing category`
      : ""
  ].filter(Boolean);
}

export function getMonthlyDataCoverageCloseBlockers(
  assessment: RealEstateMonthlyDataCoverageAssessment
): string[] {
  if (assessment.status === "needs_reconnect") {
    return ["bank account needs reconnect"];
  }

  if (assessment.status === "needs_sync") {
    return ["bank coverage needs sync"];
  }

  return [];
}

export function getMonthlyCloseBlockedMessage(
  assessment: ReturnType<typeof getMonthlyReviewAssessment>
): string {
  const blockers = getMonthlyReviewCloseBlockers(assessment);

  return `Could not close ${assessment.reviewMonth}: ${blockers.join("; ")}.`;
}

export function getMonthlyDataCoverageCloseBlockedMessage(
  assessment: RealEstateMonthlyDataCoverageAssessment
): string {
  if (assessment.status === "needs_reconnect") {
    return `Could not close ${assessment.reviewMonth}: reconnect linked bank accounts before closing this month.`;
  }

  return `Could not close ${assessment.reviewMonth}: run Check & Sync so linked bank accounts cover ${assessment.startDate} through ${assessment.endDate}.`;
}

export async function closeRealEstateMonthlyReview({
  assetId,
  dryRun = false,
  note,
  now = new Date(),
  reviewMonth,
  syncBeforeClose = true
}: {
  assetId: string;
  dryRun?: boolean;
  note: string | null;
  now?: Date;
  reviewMonth: string;
  syncBeforeClose?: boolean;
}): Promise<RealEstateMonthlyReviewCloseResult> {
  const normalizedReviewMonth = normalizeReviewMonthDate(reviewMonth);
  const affectedAssetIds = new Set<string>();
  let wroteLedgerRows = false;
  let rentSyncResult: RentCreditSyncResult | null = null;
  let expenseSyncResult: ExpenseTransactionSyncResult | null = null;
  const currentProperty = await getRealEstateAssetDetail(assetId);

  if (!currentProperty) {
    throw new Error("Could not close month: property was not found.");
  }

  const currentAssessment = getMonthlyReviewAssessment(
    currentProperty,
    normalizedReviewMonth,
    now
  );

  if (currentAssessment.closedAt) {
    return {
      affectedAssetIds: [],
      assessment: currentAssessment,
      blockers: [],
      coverageAssessment: null,
      expenseSyncResult: null,
      message: "Month is already closed.",
      rentSyncResult: null,
      status: "closed",
      wroteLedgerRows: false
    };
  }

  if (!currentAssessment.isReviewMonthComplete) {
    return {
      affectedAssetIds: [],
      assessment: currentAssessment,
      blockers: getMonthlyReviewCloseBlockers(currentAssessment),
      coverageAssessment: null,
      expenseSyncResult: null,
      message: getMonthlyCloseBlockedMessage(currentAssessment),
      rentSyncResult: null,
      status: "blocked",
      wroteLedgerRows: false
    };
  }

  if (!dryRun && syncBeforeClose) {
    if (currentProperty.rentalStatus === "rented" && currentProperty.monthlyRent > 0) {
      rentSyncResult = await syncRentCreditsForReviewMonth({
        assetId,
        matchMonth: normalizedReviewMonth
      });
      wroteLedgerRows ||= rentSyncResult.wroteLedgerRows;
      rentSyncResult.affectedAssetIds.forEach((affectedAssetId) => {
        affectedAssetIds.add(affectedAssetId);
      });
    }

    expenseSyncResult = await syncExpenseTransactionsForReviewMonth({
      assetId,
      reviewMonth: normalizedReviewMonth
    });
    wroteLedgerRows ||= expenseSyncResult.wroteLedgerRows;
    expenseSyncResult.affectedAssetIds.forEach((affectedAssetId) => {
      affectedAssetIds.add(affectedAssetId);
    });
  }

  const property = dryRun ? currentProperty : await getRealEstateAssetDetail(assetId);

  if (!property) {
    throw new Error("Could not close month: property was not found.");
  }

  const assessment = getMonthlyReviewAssessment(property, normalizedReviewMonth, now);

  if (!assessment.isReadyToClose) {
    return {
      affectedAssetIds: Array.from(affectedAssetIds),
      assessment,
      blockers: getMonthlyReviewCloseBlockers(assessment),
      coverageAssessment: null,
      expenseSyncResult,
      message: getMonthlyCloseBlockedMessage(assessment),
      rentSyncResult,
      status: "blocked",
      wroteLedgerRows
    };
  }

  const coverageAssessment = getMonthlyDataCoverageAssessment(
    property,
    normalizedReviewMonth,
    now
  );

  if (isMonthlyDataCoverageCloseBlocked(coverageAssessment)) {
    return {
      affectedAssetIds: Array.from(affectedAssetIds),
      assessment,
      blockers: getMonthlyDataCoverageCloseBlockers(coverageAssessment),
      coverageAssessment,
      expenseSyncResult,
      message: getMonthlyDataCoverageCloseBlockedMessage(coverageAssessment),
      rentSyncResult,
      status: "blocked",
      wroteLedgerRows
    };
  }

  if (dryRun) {
    return {
      affectedAssetIds: Array.from(affectedAssetIds),
      assessment,
      blockers: [],
      coverageAssessment,
      expenseSyncResult,
      message: "Month would be closed.",
      rentSyncResult,
      status: "would_close",
      wroteLedgerRows
    };
  }

  const closedAt = now.toISOString();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("real_estate_monthly_reviews").upsert(
    {
      asset_id: assetId,
      closed_at: closedAt,
      note,
      review_month: assessment.reviewMonthDate,
      updated_at: closedAt
    },
    {
      onConflict: "asset_id,review_month"
    }
  );

  if (error) {
    throw new Error(`Could not close month: ${error.message}`);
  }

  affectedAssetIds.add(assetId);

  return {
    affectedAssetIds: Array.from(affectedAssetIds),
    assessment: {
      ...assessment,
      closedAt,
      status: "closed"
    },
    blockers: [],
    coverageAssessment,
    expenseSyncResult,
    message: "",
    rentSyncResult,
    status: "closed",
    wroteLedgerRows
  };
}
