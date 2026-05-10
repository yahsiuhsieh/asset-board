"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { normalizePropertyAddress } from "@/lib/addresses";
import {
  createPlaidBankLinkToken,
  createPlaidBankUpdateLinkToken,
  exchangePlaidPublicToken,
  fetchBankTransactions,
  getPlaidConnectionAccounts,
  getPlaidItemHealth,
  PlaidItemDisconnectedError,
  removePlaidItem,
  type BankTransaction,
  type BankTransactionProviderName,
  type PlaidConnectionAccount
} from "@/lib/banking/transaction-provider";
import {
  getActiveRealEstateTransactionRules,
  getRealEstateAssetDetail
} from "@/lib/real-estate";
import { snapshotMetricLabels } from "@/lib/real-estate-history";
import {
  findMatchingTransactionRule
} from "@/lib/real-estate-transaction-rules";
import {
  getMonthlyReviewAssessment,
  RENT_TRANSACTION_SEARCH_BUFFER_DAYS
} from "@/lib/real-estate-monthly-review";
import {
  getMonthlyExpenseDebitSyncDecisions,
  getMonthlyRentCreditSyncDecisions
} from "@/lib/real-estate-monthly-transaction-sync";
import {
  getPlaidAccountConnectionKey,
  getPlaidItemConnectionKey,
  getLinkablePlaidBankConnectionOptions,
  getReusablePlaidConnectionKey,
  getUniquePlaidAccountConnections,
  hasRecentPlaidAccountRawSync,
  type LinkablePlaidBankConnectionOption,
  type ReusablePlaidBankConnectionRow
} from "@/lib/real-estate-bank-connections";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchPropertyValuation } from "@/lib/valuations/property-valuation-provider";
import {
  getPropertyValuationUsageStatus,
  recordPropertyValuationUsage
} from "@/lib/valuations/property-valuation-usage";
import type {
  RealEstateExpenseCategory,
  RealEstateMetricType,
  RealEstateRentalStatus,
  RealEstateTransactionClassification,
  ValuationProvider
} from "@/types/wealth";

const PROPERTY_PHOTO_BUCKET = "property-photos";
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MIN_RENT_CREDIT_REVIEW_AMOUNT = 10;
const MANUAL_PLAID_SYNC_DAYS = 60;
const MANUAL_PLAID_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const RAW_BANK_TRANSACTION_STALE_MS = 12 * 60 * 60 * 1000;

export interface RealEstateActionState {
  status: "idle" | "success" | "error";
  message: string;
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

export interface RentTransactionMatchState extends RealEstateActionState {
  provider: string;
  matchMonth: string;
  matches: RentTransactionMatch[];
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

export interface ExpenseTransactionPreviewState extends RealEstateActionState {
  provider: string;
  reviewMonth: string;
  transactions: ExpenseTransactionPreview[];
}

export interface PlaidLinkTokenState extends RealEstateActionState {
  linkToken: string | null;
}

export interface LinkablePlaidBankConnectionsState extends RealEstateActionState {
  connections: LinkablePlaidBankConnectionOption[];
}

const successState = (message: string): RealEstateActionState => ({
  status: "success",
  message
});

const errorState = (message: string): RealEstateActionState => ({
  status: "error",
  message
});

function revalidatePropertyPages(assetId?: string) {
  revalidatePath("/");
  revalidatePath("/real-estate");

  if (assetId) {
    revalidatePath(`/real-estate/${assetId}`);
  }
}

function revalidateTransactionRulesPages(assetId?: string | null) {
  revalidatePropertyPages(assetId ?? undefined);
  revalidatePath("/real-estate/rules");
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readMoney(formData: FormData, key: string): number {
  const rawValue = readText(formData, key);

  if (!rawValue) {
    return 0;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a positive number.`);
  }

  return value;
}

function readOptionalNumber(formData: FormData, key: string): number | null {
  const rawValue = readText(formData, key);

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

function readCoordinate(formData: FormData, key: string): number | null {
  const rawValue = readText(formData, key).replace(",", ".");

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

function readMapZoom(formData: FormData): number {
  const value = readOptionalNumber(formData, "mapZoom");

  if (value == null) {
    return 12;
  }

  if (value < 1 || value > 20) {
    throw new Error("mapZoom must be between 1 and 20.");
  }

  return Math.round(value);
}

function readMonthStart(formData: FormData, key: string): string {
  const rawValue = readText(formData, key);

  if (!/^\d{4}-\d{2}$/.test(rawValue)) {
    throw new Error(`${key} must be a valid month.`);
  }

  return `${rawValue}-01`;
}

function readOptionalDate(formData: FormData, key: string): string | null {
  const value = readText(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} must be a valid date.`);
  }

  return value;
}

function readRentalStatus(formData: FormData): RealEstateRentalStatus {
  const value = readText(formData, "rentalStatus") || "rented";

  if (value !== "rented" && value !== "vacant") {
    throw new Error("Choose whether this property is rented or vacant.");
  }

  return value;
}

function getMonthRange(monthStart: string): { startDate: string; endDate: string } {
  const start = new Date(`${monthStart}T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const endOfMonth = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  return {
    startDate: monthStart,
    endDate: endOfMonth.toISOString().slice(0, 10)
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
    startDate: bufferedStart.toISOString().slice(0, 10),
    endDate: bufferedEnd.toISOString().slice(0, 10)
  };
}

function getRecentDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function isReviewableRentCredit(transaction: BankTransaction): boolean {
  return (
    transaction.direction === "credit" &&
    transaction.amount >= MIN_RENT_CREDIT_REVIEW_AMOUNT
  );
}

function readPropertyPayload(formData: FormData) {
  const name = readText(formData, "name");
  const address = normalizePropertyAddress(readText(formData, "address"));

  if (!name) {
    throw new Error("Property name is required.");
  }

  if (!address) {
    throw new Error("Address is required.");
  }

  const now = new Date().toISOString();
  const purchasePrice = readMoney(formData, "purchasePrice");
  const county = readText(formData, "county") || null;
  const parcelNumber = readText(formData, "parcelNumber") || null;

  return {
    asset: {
      name,
      type: "real_estate",
      updated_at: now
    },
    property: {
      address,
      rental_status: readRentalStatus(formData),
      county,
      purchased_at: readOptionalDate(formData, "purchasedAt"),
      parcel_number: parcelNumber,
      purchase_price: purchasePrice,
      remaining_mortgage_balance: readMoney(formData, "remainingMortgageBalance"),
      monthly_rent: readMoney(formData, "monthlyRent"),
      monthly_mortgage: readMoney(formData, "monthlyMortgage"),
      building_cost: readMoney(formData, "buildingCost"),
      land_cost: readMoney(formData, "landCost"),
      total_depreciation: readMoney(formData, "totalDepreciation"),
      updated_at: now
    }
  };
}

interface PropertyValuationRow {
  address: string;
  current_market_value: string | number;
  purchase_price: string | number;
}

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
  provider_item_id: string | null;
  status: string;
  last_synced_at: string | null;
  raw_transactions_synced_start_date: string | null;
  raw_transactions_synced_end_date: string | null;
}

interface PropertyBankConnectionDetailRow extends PropertyBankConnectionRow {
  asset_id: string;
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

async function loadPropertyValuationInput(assetId: string): Promise<PropertyValuationRow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_properties")
    .select("address, current_market_value, purchase_price")
    .eq("asset_id", assetId)
    .single();

  if (error) {
    throw new Error(`Could not load valuation: ${error.message}`);
  }

  return data as PropertyValuationRow;
}

async function loadPropertyRentMatchInput(assetId: string): Promise<PropertyRentMatchRow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_properties")
    .select(
      `
      monthly_rent,
      rent_match_tolerance
    `
    )
    .eq("asset_id", assetId)
    .single();

  if (error) {
    throw new Error(`Could not load rent matching settings: ${error.message}`);
  }

  return data as PropertyRentMatchRow;
}

async function isMonthlyReviewClosed({
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
    .eq("review_month", reviewMonth)
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

async function assertRawBankTransactionLedgerOwnerIsOpen(
  rawBankTransactionId: string
) {
  if (!rawBankTransactionId) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_property_transactions")
    .select("asset_id, direction, posted_at, rent_period_month")
    .eq("raw_bank_transaction_id", rawBankTransactionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check existing ledger owner: ${error.message}`);
  }

  if (data) {
    await assertPropertyTransactionOwnerReviewIsOpen(
      data as PropertyTransactionReviewOwnerRow
    );
  }
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

async function loadPropertyBankConnection({
  assetId,
  connectionId
}: {
  assetId: string;
  connectionId: string;
}): Promise<PropertyBankConnectionDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select(
      "id, asset_id, provider, access_token, account_id, account_name, account_type, account_subtype, institution_name, institution_id, last_four, provider_item_id, status, last_synced_at, raw_transactions_synced_start_date, raw_transactions_synced_end_date"
    )
    .eq("id", connectionId)
    .eq("asset_id", assetId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    throw new Error(`Could not load bank connection: ${error.message}`);
  }

  return data as PropertyBankConnectionDetailRow;
}

async function hasRemainingPlaidItemConnections(
  connection: PropertyBankConnectionDetailRow
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("real_estate_bank_connections")
    .select("id", { count: "exact", head: true })
    .eq("provider", "plaid")
    .eq("status", "active")
    .neq("id", connection.id);

  if (connection.provider_item_id) {
    query = query.eq("provider_item_id", connection.provider_item_id);
  } else {
    query = query.eq("access_token", connection.access_token);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Could not check Plaid item usage: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

async function loadPropertyPlaidBankConnections(
  assetId: string
): Promise<PropertyBankConnectionDetailRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select(
      "id, asset_id, provider, access_token, account_id, account_name, account_type, account_subtype, institution_name, institution_id, last_four, provider_item_id, status, last_synced_at, raw_transactions_synced_start_date, raw_transactions_synced_end_date"
    )
    .eq("asset_id", assetId)
    .eq("provider", "plaid")
    .order("account_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load Plaid bank connections: ${error.message}`);
  }

  return (data ?? []) as PropertyBankConnectionDetailRow[];
}

async function loadReusablePlaidBankConnections(): Promise<
  ReusablePlaidBankConnectionRow[]
> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select(
      "id, asset_id, provider, access_token, account_id, account_name, account_type, account_subtype, institution_name, institution_id, last_four, provider_item_id, status"
    )
    .eq("provider", "plaid")
    .order("institution_name", { ascending: true })
    .order("account_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load existing Plaid bank connections: ${error.message}`);
  }

  return (data ?? []) as ReusablePlaidBankConnectionRow[];
}

async function loadReusablePlaidBankConnection(
  connectionId: string
): Promise<ReusablePlaidBankConnectionRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select(
      "id, asset_id, provider, access_token, account_id, account_name, account_type, account_subtype, institution_name, institution_id, last_four, provider_item_id, status"
    )
    .eq("id", connectionId)
    .eq("provider", "plaid")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    throw new Error(`Could not load existing Plaid bank connection: ${error.message}`);
  }

  return data as ReusablePlaidBankConnectionRow;
}

function getPlaidItemGroupKey(
  connection: Pick<PropertyBankConnectionRow, "access_token" | "provider_item_id">
): string {
  return getPlaidItemConnectionKey(connection);
}

function normalizeBankConnectionFingerprintText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getPlaidAccountFingerprint(
  account: Pick<
    PlaidConnectionAccount,
    | "accountName"
    | "accountSubtype"
    | "accountType"
    | "institutionId"
    | "institutionName"
    | "lastFour"
  >
): string {
  return [
    normalizeBankConnectionFingerprintText(account.institutionId),
    normalizeBankConnectionFingerprintText(account.institutionName),
    normalizeBankConnectionFingerprintText(account.accountType),
    normalizeBankConnectionFingerprintText(account.accountSubtype),
    normalizeBankConnectionFingerprintText(account.lastFour),
    normalizeBankConnectionFingerprintText(account.accountName)
  ].join("|");
}

function getPlaidConnectionFingerprint(
  connection: Pick<
    PropertyBankConnectionDetailRow,
    | "account_name"
    | "account_subtype"
    | "account_type"
    | "institution_id"
    | "institution_name"
    | "last_four"
  >
): string {
  return [
    normalizeBankConnectionFingerprintText(connection.institution_id),
    normalizeBankConnectionFingerprintText(connection.institution_name),
    normalizeBankConnectionFingerprintText(connection.account_type),
    normalizeBankConnectionFingerprintText(connection.account_subtype),
    normalizeBankConnectionFingerprintText(connection.last_four),
    normalizeBankConnectionFingerprintText(connection.account_name)
  ].join("|");
}

function groupPlaidConnectionsByItem(
  connections: PropertyBankConnectionDetailRow[]
): PropertyBankConnectionDetailRow[][] {
  const groups = new Map<string, PropertyBankConnectionDetailRow[]>();

  connections.forEach((connection) => {
    const key = getPlaidItemGroupKey(connection);
    const group = groups.get(key) ?? [];

    group.push(connection);
    groups.set(key, group);
  });

  return Array.from(groups.values());
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
    provider: "plaid",
    provider_item_id: getRawProviderItemId(connection),
    provider_account_id: connection.account_id,
    provider_transaction_id: transaction.id,
    bank_connection_id: connection.id,
    account_name: transaction.accountName,
    posted_at: transaction.postedAt,
    title: transaction.title,
    description: transaction.description,
    memo: transaction.memo || null,
    amount: transaction.amount,
    direction: transaction.direction,
    synced_at: syncedAt,
    updated_at: syncedAt
  };
}

function mapRawBankTransactionToBankTransaction(
  row: RawBankTransactionRow
): BankTransaction {
  return {
    id: row.provider_transaction_id,
    connectionId: row.bank_connection_id ?? `raw:${row.id}`,
    providerItemId: row.provider_item_id,
    rawBankTransactionId: row.id,
    postedAt: row.posted_at,
    title: row.title,
    memo: row.memo ?? "",
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    accountId: row.provider_account_id,
    accountName: row.account_name
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
        startDate,
        endDate,
        expectedRentAmount,
        plaidAccessToken: connection.access_token,
        plaidAccountId: connection.account_id,
        plaidAccountName: connection.account_name,
        plaidProviderItemId: getRawProviderItemId(connection),
        bankConnectionId: connection.id,
        bankProvider: "plaid"
      });
    })
  );

  return {
    provider: transactionGroups.find((group) => group.provider === "plaid")?.provider ?? "plaid",
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

async function loadRawBankTransaction(
  rawBankTransactionId: string
): Promise<BankTransaction | null> {
  if (!rawBankTransactionId) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_raw_bank_transactions")
    .select(
      "id, provider, provider_item_id, provider_account_id, provider_transaction_id, bank_connection_id, account_name, posted_at, title, description, memo, amount, direction"
    )
    .eq("id", rawBankTransactionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    throw new Error(`Could not load raw bank transaction: ${error.message}`);
  }

  return mapRawBankTransactionToBankTransaction(data as RawBankTransactionRow);
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

async function fetchPropertyBankTransactions({
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
        connectionId: getLedgerBankConnectionId(transaction),
        accountId: transaction.accountId,
        transactionId: transaction.id
      })
    ) ?? null
  );
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
            connectionId: row.bank_connection_id,
            accountId: row.account_id,
            transactionId: row.provider_transaction_id
          });

      return [key, row] as [string, PropertyTransactionClassificationRow];
    })
  );
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
    .select("raw_bank_transaction_id, asset_id")
    .in("raw_bank_transaction_id", uniqueRawIds);

  if (error) {
    throw new Error(`Could not load assigned bank transactions: ${error.message}`);
  }

  return new Set(
    ((data ?? []) as Array<{
      asset_id: string;
      raw_bank_transaction_id: string | null;
    }>)
      .filter((row) => row.raw_bank_transaction_id && row.asset_id !== assetId)
      .map((row) => row.raw_bank_transaction_id as string)
  );
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

function getLedgerBankConnectionId(transaction: BankTransaction): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    transaction.connectionId
  )
    ? transaction.connectionId
    : null;
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
    asset_id: assetId,
    raw_bank_transaction_id: transaction.rawBankTransactionId ?? null,
    bank_connection_id: getLedgerBankConnectionId(transaction),
    provider,
    provider_transaction_id: transaction.id,
    account_id: transaction.accountId,
    account_name: transaction.accountName,
    posted_at: transaction.postedAt,
    description: description || transaction.description,
    original_description: transaction.description,
    memo: transaction.memo || null,
    amount: transaction.amount,
    direction: transaction.direction,
    classification,
    category,
    rent_period_month: rentPeriodMonth,
    note,
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
        onConflict: "raw_bank_transaction_id"
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
  assetId,
  rules,
  transaction
}: {
  assetId: string;
  rules: Awaited<ReturnType<typeof getActiveRealEstateTransactionRules>>;
  transaction: BankTransaction;
}) {
  return findMatchingTransactionRule(rules, {
    assetId,
    amount: transaction.amount,
    description: transaction.description,
    direction: transaction.direction
  });
}

async function syncRecentPlaidTransactions({
  assetId,
  connections,
  endDate,
  startDate,
  syncedAt
}: {
  assetId: string;
  connections: PropertyBankConnectionDetailRow[];
  endDate: string;
  startDate: string;
  syncedAt: string;
}): Promise<{
  disconnectedItemKeys: string[];
  fetchedCount: number;
  syncedRawTransactions: number;
}> {
  void assetId;
  const syncResult = await syncPlaidRawBankTransactionsForConnections({
    connections,
    endDate,
    startDate,
    syncedAt
  });

  return {
    disconnectedItemKeys: syncResult.disconnectedItemKeys,
    fetchedCount: syncResult.fetchedCount,
    syncedRawTransactions: syncResult.fetchedCount
  };
}

async function savePropertyValuation(
  assetId: string,
  currentMarketValue: number,
  syncedAt: string,
  source: ValuationProvider
) {
  const supabase = createServerSupabaseClient();

  const { error: propertyError } = await supabase
    .from("real_estate_properties")
    .update({
      current_market_value: currentMarketValue,
      current_market_value_source: source,
      current_market_value_synced_at: syncedAt,
      updated_at: syncedAt
    })
    .eq("asset_id", assetId);

  if (propertyError) {
    throw new Error(`Could not save valuation: ${propertyError.message}`);
  }

  const { error: assetError } = await supabase
    .from("assets")
    .update({
      value: currentMarketValue,
      updated_at: syncedAt
    })
    .eq("id", assetId);

  if (assetError) {
    throw new Error(`Could not update asset value: ${assetError.message}`);
  }

  return currentMarketValue;
}

function readExpenseCategory(formData: FormData): RealEstateExpenseCategory {
  const category = readText(formData, "category") as RealEstateExpenseCategory;
  const supportedCategories: RealEstateExpenseCategory[] = [
    "taxes",
    "insurance",
    "maintenance",
    "hoa",
    "utilities",
    "other"
  ];

  if (!supportedCategories.includes(category)) {
    throw new Error("Choose a supported expense category.");
  }

  return category;
}

function readTransactionRuleTargetAmount(formData: FormData): number {
  const rawValue = readText(formData, "targetAmount");

  if (!rawValue) {
    throw new Error("Target amount is required.");
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Target amount must be greater than zero.");
  }

  return Math.round(value * 100) / 100;
}

function readOptionalTransactionRuleAssetId(formData: FormData): string | null {
  const assetId = readText(formData, "assetId");

  return assetId && assetId !== "all" ? assetId : null;
}

function readOptionalTransactionRuleName(formData: FormData): string | null {
  return readText(formData, "setTransactionName") || null;
}

export async function createRealEstateTransactionRule(
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;

  try {
    const name = readText(formData, "name");
    const containsText = readText(formData, "containsText");
    const targetAmount = readTransactionRuleTargetAmount(formData);
    const category = readExpenseCategory(formData);
    const assetId = readOptionalTransactionRuleAssetId(formData);
    const setTransactionName = readOptionalTransactionRuleName(formData);

    if (!name) {
      return errorState("Rule name is required.");
    }

    if (!containsText) {
      return errorState("Transaction name text is required.");
    }

    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_transaction_rules").insert({
      asset_id: assetId,
      name,
      contains_text: containsText,
      target_amount: targetAmount,
      set_transaction_name: setTransactionName,
      category,
      is_active: true,
      updated_at: now
    });

    if (error) {
      return errorState(`Could not create transaction rule: ${error.message}`);
    }

    revalidateTransactionRulesPages(assetId);
    return successState("Transaction rule created.");
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "Could not create transaction rule."
    );
  }
}

export async function deactivateRealEstateTransactionRule(formData: FormData) {
  const ruleId = readText(formData, "ruleId");

  if (!ruleId) {
    throw new Error("Missing transaction rule.");
  }

  const now = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_transaction_rules")
    .update({
      is_active: false,
      updated_at: now
    })
    .eq("id", ruleId)
    .select("asset_id")
    .single();

  if (error) {
    throw new Error(`Could not deactivate transaction rule: ${error.message}`);
  }

  revalidateTransactionRulesPages(data?.asset_id ?? null);
}

export async function reactivateRealEstateTransactionRule(formData: FormData) {
  const ruleId = readText(formData, "ruleId");

  if (!ruleId) {
    throw new Error("Missing transaction rule.");
  }

  const now = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_transaction_rules")
    .update({
      is_active: true,
      updated_at: now
    })
    .eq("id", ruleId)
    .select("asset_id")
    .single();

  if (error) {
    throw new Error(`Could not reactivate transaction rule: ${error.message}`);
  }

  revalidateTransactionRulesPages(data?.asset_id ?? null);
}

export async function deleteRealEstateTransactionRule(formData: FormData) {
  const ruleId = readText(formData, "ruleId");

  if (!ruleId) {
    throw new Error("Missing transaction rule.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_transaction_rules")
    .delete()
    .eq("id", ruleId)
    .select("asset_id")
    .single();

  if (error) {
    throw new Error(`Could not delete transaction rule: ${error.message}`);
  }

  revalidateTransactionRulesPages(data?.asset_id ?? null);
}

export async function createRealEstateProperty(
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const payload = readPropertyPayload(formData);
    const supabase = createServerSupabaseClient();

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({
        ...payload.asset,
        value: 0
      })
      .select("id")
      .single();

    if (assetError) {
      return errorState(`Could not create asset: ${assetError.message}`);
    }

    const { error: propertyError } = await supabase.from("real_estate_properties").insert({
      ...payload.property,
      current_market_value: 0,
      current_market_value_source: "manual",
      asset_id: asset.id
    });

    if (propertyError) {
      await supabase.from("assets").delete().eq("id", asset.id);
      return errorState(`Could not create property: ${propertyError.message}`);
    }

    revalidatePropertyPages(asset.id);
    return successState("Property added.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not create property.");
  }
}

export async function updateRealEstateProperty(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const payload = readPropertyPayload(formData);
    const supabase = createServerSupabaseClient();

    const { error: assetError } = await supabase
      .from("assets")
      .update(payload.asset)
      .eq("id", assetId);

    if (assetError) {
      return errorState(`Could not update asset: ${assetError.message}`);
    }

    const { data: updatedProperty, error: propertyError } = await supabase
      .from("real_estate_properties")
      .update(payload.property)
      .eq("asset_id", assetId)
      .select("asset_id")
      .single();

    if (propertyError) {
      return errorState(`Could not update property: ${propertyError.message}`);
    }

    if (!updatedProperty) {
      return errorState("Could not update property: no matching property was found.");
    }

    revalidatePropertyPages(assetId);
    return successState("Property updated.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not update property.");
  }
}

export async function deleteRealEstateProperty(formData: FormData) {
  const assetId = readText(formData, "assetId");

  if (!assetId) {
    throw new Error("Missing property asset id.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("assets").delete().eq("id", assetId);

  if (error) {
    throw new Error(`Could not delete property: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}

export async function updatePropertyLocation(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const latitude = readCoordinate(formData, "latitude");
    const longitude = readCoordinate(formData, "longitude");

    if (latitude != null && (latitude < -90 || latitude > 90)) {
      throw new Error("Latitude must be between -90 and 90.");
    }

    if (longitude != null && (longitude < -180 || longitude > 180)) {
      throw new Error("Longitude must be between -180 and 180.");
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("real_estate_properties")
      .update({
        latitude,
        longitude,
        map_zoom: readMapZoom(formData),
        updated_at: new Date().toISOString()
      })
      .eq("asset_id", assetId)
      .select("asset_id, latitude, longitude, map_zoom")
      .single();

    if (error) {
      return errorState(`Could not update location: ${error.message}`);
    }

    if (!data) {
      return errorState("Could not update location: no matching property was found.");
    }

    revalidatePropertyPages(assetId);
    return successState("Location updated.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not update location.");
  }
}

export async function createPlaidLinkToken(assetId: string): Promise<PlaidLinkTokenState> {
  try {
    const property = await getRealEstateAssetDetail(assetId);

    if (!property) {
      return {
        status: "error",
        message: "Could not create Plaid Link token: property was not found.",
        linkToken: null
      };
    }

    return {
      status: "success",
      message: "",
      linkToken: await createPlaidBankLinkToken(assetId)
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not create Plaid Link token.",
      linkToken: null
    };
  }
}

export async function createPlaidReconnectLinkToken(
  assetId: string,
  connectionId: string
): Promise<PlaidLinkTokenState> {
  try {
    const connection = await loadPropertyBankConnection({ assetId, connectionId });

    if (!connection) {
      return {
        status: "error",
        message: "Could not reconnect bank account: no matching account was found.",
        linkToken: null
      };
    }

    if (connection.provider !== "plaid") {
      return {
        status: "error",
        message: "Only Plaid bank accounts can be reconnected.",
        linkToken: null
      };
    }

    if (connection.status === "active") {
      return {
        status: "error",
        message: "This bank account is already connected.",
        linkToken: null
      };
    }

    return {
      status: "success",
      message: "",
      linkToken: await createPlaidBankUpdateLinkToken({
        accessToken: connection.access_token,
        assetId
      })
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not create Plaid reconnect token.",
      linkToken: null
    };
  }
}

export async function connectPlaidBank(
  assetId: string,
  publicToken: string,
  selectedAccountIds: string[] = []
): Promise<RealEstateActionState> {
  try {
    const token = publicToken.trim();

    if (!token) {
      return errorState("Plaid public token is missing.");
    }

    const exchangedToken = await exchangePlaidPublicToken(token);
    const accounts = await getPlaidConnectionAccounts({
      accessToken: exchangedToken.accessToken,
      itemId: exchangedToken.itemId,
      selectedAccountIds
    });
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const existingConnections = await loadPropertyPlaidBankConnections(assetId);
    const claimedExistingConnectionIds = new Set<string>();
    const inserts: Array<Record<string, string | null>> = [];
    const updatedConnections: Array<{ id: string; account_name: string }> = [];

    for (const account of accounts) {
      const accountFingerprint = getPlaidAccountFingerprint(account);
      const existingConnection = existingConnections.find(
        (connection) =>
          !claimedExistingConnectionIds.has(connection.id) &&
          getPlaidConnectionFingerprint(connection) === accountFingerprint
      );
      const row = {
        asset_id: assetId,
        provider: "plaid",
        access_token: exchangedToken.accessToken,
        account_id: account.accountId,
        account_name: account.accountName,
        account_type: account.accountType,
        account_subtype: account.accountSubtype,
        institution_name: account.institutionName,
        institution_id: account.institutionId,
        last_four: account.lastFour,
        provider_item_id: account.providerItemId,
        status: "active",
        connected_at: now,
        updated_at: now
      };

      if (existingConnection) {
        claimedExistingConnectionIds.add(existingConnection.id);
        const { data, error } = await supabase
          .from("real_estate_bank_connections")
          .update(row)
          .eq("id", existingConnection.id)
          .eq("asset_id", assetId)
          .select("id, account_name")
          .single();

        if (error) {
          return errorState(`Could not save Plaid connection: ${error.message}`);
        }

        updatedConnections.push(data as { id: string; account_name: string });
      } else {
        inserts.push(row);
      }
    }

    let insertedConnections: Array<{ id: string; account_name: string }> = [];

    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from("real_estate_bank_connections")
        .upsert(inserts, {
          onConflict: "asset_id,provider,account_id"
        })
        .select("id, account_name");

      if (error) {
        return errorState(`Could not save Plaid connection: ${error.message}`);
      }

      insertedConnections = (data ?? []) as Array<{ id: string; account_name: string }>;
    }

    const data = [...updatedConnections, ...insertedConnections];

    if (data.length === 0) {
      return errorState("Could not save Plaid connection: no bank accounts were found.");
    }

    revalidatePropertyPages(assetId);
    return successState(
      `${data.length} bank ${data.length === 1 ? "account" : "accounts"} connected.`
    );
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not connect bank.");
  }
}

export async function listLinkablePlaidBankConnections(
  assetId: string
): Promise<LinkablePlaidBankConnectionsState> {
  try {
    const connections = await loadReusablePlaidBankConnections();
    const options = getLinkablePlaidBankConnectionOptions({
      connections,
      targetAssetId: assetId
    });

    return {
      status: "success",
      message:
        options.length > 0
          ? `${options.length} existing bank ${options.length === 1 ? "account is" : "accounts are"} available.`
          : "No existing bank accounts are available to link.",
      connections: options
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not load existing bank accounts.",
      connections: []
    };
  }
}

export async function linkExistingPlaidBankConnection(
  assetId: string,
  sourceConnectionId: string
): Promise<RealEstateActionState> {
  try {
    const sourceConnection = await loadReusablePlaidBankConnection(sourceConnectionId);

    if (!sourceConnection) {
      return errorState("Could not link existing bank account: no matching account was found.");
    }

    if (sourceConnection.status !== "active") {
      return errorState("Only connected bank accounts can be linked to another property.");
    }

    if (sourceConnection.asset_id === assetId) {
      return errorState("This bank account is already linked to this property.");
    }

    const targetConnections = await loadPropertyPlaidBankConnections(assetId);
    const sourceConnectionKey = getReusablePlaidConnectionKey(sourceConnection);
    const isAlreadyLinked = targetConnections.some(
      (connection) => getReusablePlaidConnectionKey(connection) === sourceConnectionKey
    );

    if (isAlreadyLinked) {
      return successState("This bank account is already linked to this property.");
    }

    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("real_estate_bank_connections")
      .upsert(
        {
          asset_id: assetId,
          provider: "plaid",
          access_token: sourceConnection.access_token,
          account_id: sourceConnection.account_id,
          account_name: sourceConnection.account_name,
          account_type: sourceConnection.account_type,
          account_subtype: sourceConnection.account_subtype,
          institution_name: sourceConnection.institution_name,
          institution_id: sourceConnection.institution_id,
          last_four: sourceConnection.last_four,
          provider_item_id: sourceConnection.provider_item_id,
          status: "active",
          connected_at: now,
          updated_at: now
        },
        {
          onConflict: "asset_id,provider,account_id"
        }
      )
      .select("id");

    if (error) {
      return errorState(`Could not link existing bank account: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return errorState("Could not link existing bank account: no row was saved.");
    }

    revalidatePropertyPages(assetId);
    return successState("Existing bank account linked. This did not create a new Plaid Item.");
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "Could not link existing bank account."
    );
  }
}

export async function completePlaidReconnect(
  assetId: string,
  connectionId: string
): Promise<RealEstateActionState> {
  try {
    const connection = await loadPropertyBankConnection({ assetId, connectionId });

    if (!connection) {
      return errorState("Could not reconnect bank account: no matching account was found.");
    }

    if (connection.provider !== "plaid") {
      return errorState("Only Plaid bank accounts can be reconnected.");
    }

    const supabase = createServerSupabaseClient();
    const updatePayload = {
      status: "active",
      updated_at: new Date().toISOString()
    };
    const query = supabase
      .from("real_estate_bank_connections")
      .update(updatePayload)
      .eq("provider", "plaid");

    const { error } = connection.provider_item_id
      ? await query.eq("provider_item_id", connection.provider_item_id)
      : await query.eq("access_token", connection.access_token);

    if (error) {
      return errorState(`Could not save reconnected account: ${error.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("Bank account reconnected.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not reconnect bank.");
  }
}

export async function checkAndSyncPlaidBankConnections(
  assetId: string,
  _previousState: RealEstateActionState,
  _formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;
  void _formData;

  try {
    const connections = await loadPropertyPlaidBankConnections(assetId);

    if (connections.length === 0) {
      return successState("No bank accounts to check.");
    }

    const checkedAt = new Date().toISOString();
    const checkedAtDate = new Date(checkedAt);
    const { startDate, endDate } = getRecentDateRange(MANUAL_PLAID_SYNC_DAYS);
    const activeConnections: PropertyBankConnectionDetailRow[] = [];
    const skippedSharedAccountKeys = new Set<string>();
    let disconnectedCount = 0;

    for (const group of groupPlaidConnectionsByItem(connections)) {
      const primaryConnection = group[0];
      const uniqueAccountConnections = getUniquePlaidAccountConnections(group);
      const allAccountsRecentlySynced = uniqueAccountConnections.every((connection) =>
        hasRecentPlaidAccountRawSync({
          connection,
          cooldownMs: MANUAL_PLAID_SYNC_COOLDOWN_MS,
          endDate,
          now: checkedAtDate,
          startDate
        })
      );

      if (allAccountsRecentlySynced) {
        uniqueAccountConnections.forEach((connection) => {
          skippedSharedAccountKeys.add(getPlaidAccountConnectionKey(connection));
        });
        continue;
      }

      const health = await getPlaidItemHealth(primaryConnection.access_token);

      if (health.status === "disconnected") {
        await updatePlaidConnectionGroup({
          connection: primaryConnection,
          status: "disconnected",
          updatedAt: checkedAt
        });
        disconnectedCount += group.length;
        continue;
      }

      await updatePlaidConnectionGroup({
        connection: primaryConnection,
        status: "active",
        updatedAt: checkedAt
      });
      uniqueAccountConnections.forEach((connection) => {
        if (
          hasRecentPlaidAccountRawSync({
            connection,
            cooldownMs: MANUAL_PLAID_SYNC_COOLDOWN_MS,
            endDate,
            now: checkedAtDate,
            startDate
          })
        ) {
          skippedSharedAccountKeys.add(getPlaidAccountConnectionKey(connection));
          return;
        }

        activeConnections.push(connection);
      });
    }

    let fetchedCount = 0;
    let syncedRawTransactions = 0;

    if (activeConnections.length > 0) {
      const syncResult = await syncRecentPlaidTransactions({
        assetId,
        connections: activeConnections,
        endDate,
        startDate,
        syncedAt: checkedAt
      });

      fetchedCount = syncResult.fetchedCount;
      syncedRawTransactions = syncResult.syncedRawTransactions;
      const disconnectedItemKeys = new Set(syncResult.disconnectedItemKeys);
      const syncedActiveConnections = activeConnections.filter(
        (connection) => !disconnectedItemKeys.has(getPlaidItemGroupKey(connection))
      );
      disconnectedCount += groupPlaidConnectionsByItem(activeConnections)
        .filter((group) => disconnectedItemKeys.has(getPlaidItemGroupKey(group[0])))
        .reduce((count, group) => count + group.length, 0);
      syncedActiveConnections.forEach((connection) => {
        skippedSharedAccountKeys.delete(getPlaidAccountConnectionKey(connection));
      });
    }

    revalidatePropertyPages(assetId);
    return successState(
      [
        `${connections.length} bank ${connections.length === 1 ? "account" : "accounts"} checked.`,
        `${syncedRawTransactions} raw ${syncedRawTransactions === 1 ? "transaction" : "transactions"} synced.`,
        `${fetchedCount} posted ${fetchedCount === 1 ? "transaction" : "transactions"} scanned from the last ${MANUAL_PLAID_SYNC_DAYS} days.`,
        skippedSharedAccountKeys.size > 0
          ? `${skippedSharedAccountKeys.size} shared ${skippedSharedAccountKeys.size === 1 ? "account used" : "accounts used"} recent raw sync.`
          : "",
        "Closed monthly reviews were not changed.",
        disconnectedCount > 0
          ? `${disconnectedCount} ${disconnectedCount === 1 ? "account needs" : "accounts need"} reconnect.`
          : ""
      ]
        .filter(Boolean)
        .join(" ")
    );
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "Could not check and sync bank accounts."
    );
  }
}

export async function removeBankConnection(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;

  try {
    const connectionId = readText(formData, "connectionId");

    if (!connectionId) {
      return errorState("Choose a bank connection to remove.");
    }

    const connection = await loadPropertyBankConnection({ assetId, connectionId });

    if (!connection) {
      return errorState("Could not remove bank connection: no matching account was found.");
    }

    if (connection.provider === "plaid") {
      const hasRemainingConnections = await hasRemainingPlaidItemConnections(connection);

      if (!hasRemainingConnections) {
        await removePlaidItem(connection.access_token);
      }
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("real_estate_bank_connections")
      .delete()
      .eq("id", connectionId)
      .eq("asset_id", assetId)
      .select("id, account_name");

    if (error) {
      return errorState(`Could not remove bank connection: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return errorState("Could not remove bank connection: no matching account was found.");
    }

    revalidatePropertyPages(assetId);
    return successState("Bank connection removed.");
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "Could not remove bank connection."
    );
  }
}

interface RentCreditSyncResult {
  autoMatchedCount: number;
  matchMonth: string;
  matches: RentTransactionMatch[];
  pendingReviewCount: number;
  provider: string;
  skippedBankSync: boolean;
  wroteLedgerRows: boolean;
}

async function syncRentCreditsForReviewMonth({
  allowMockFallback = true,
  assetId,
  matchMonth
}: {
  allowMockFallback?: boolean;
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

  const { startDate, endDate } = getBufferedMonthRange(
    matchMonth,
    RENT_TRANSACTION_SEARCH_BUFFER_DAYS
  );
  const transactionResult = allowMockFallback
    ? await fetchPropertyBankTransactions({
        assetId,
        startDate,
        endDate,
        expectedRentAmount: expectedAmount
      })
    : await fetchPropertyConnectedBankTransactions({
        assetId,
        startDate,
        endDate,
        expectedRentAmount: expectedAmount
      });

  if (!transactionResult) {
    return {
      autoMatchedCount: 0,
      matchMonth: matchMonth.slice(0, 7),
      matches: [],
      pendingReviewCount: 0,
      provider: "",
      skippedBankSync: true,
      wroteLedgerRows: false
    };
  }

  const availableTransactions = await filterTransactionsOwnedByCurrentProperty({
    assetId,
    transactions: transactionResult.transactions
  });
  let classifications = await loadPropertyTransactionClassifications({
    assetId,
    startDate,
    endDate
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
  let wroteLedgerRows = false;

  if (autoMatchedDecisions.length > 0) {
    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      autoMatchedDecisions.map((decision) =>
        buildPropertyTransactionLedgerRow({
          assetId,
          category: null,
          classification: "rental_income",
          note: "Auto matched by target rent amount.",
          provider: transactionResult.provider,
          rentPeriodMonth: matchMonth,
          transaction: decision.transaction,
          updatedAt: now
        })
      ),
      "Could not auto-record rental income"
    );

    wroteLedgerRows = true;
    classifications = await loadPropertyTransactionClassifications({
      assetId,
      startDate,
      endDate
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
  }

  const pendingDecisions = decisions.filter(
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
          note: "Needs rent review.",
          provider: transactionResult.provider,
          rentPeriodMonth: matchMonth,
          transaction: decision.transaction,
          updatedAt: now
        })
      ),
      "Could not save pending rent credits"
    );

    wroteLedgerRows = true;
  }

  const matches = decisions.map((decision) => ({
    id: decision.transaction.id,
    connectionId: decision.transaction.connectionId,
    rawBankTransactionId: decision.transaction.rawBankTransactionId ?? null,
    postedAt: decision.transaction.postedAt,
    title: decision.transaction.title,
    memo: decision.transaction.memo,
    description: decision.transaction.description,
    amount: decision.transaction.amount,
    accountName: decision.transaction.accountName,
    classification: decision.classification?.classification ?? null,
    recordedTransactionId: decision.classification?.id ?? null,
    rentPeriodMonth: decision.rentPeriodMonth,
    amountMatchesTarget: decision.amountMatchesTarget
  }));

  return {
    autoMatchedCount: autoMatchedDecisions.length,
    matchMonth: matchMonth.slice(0, 7),
    matches,
    pendingReviewCount: matches.filter((match) => !match.classification).length,
    provider: transactionResult.provider,
    skippedBankSync: false,
    wroteLedgerRows
  };
}

interface ExpenseTransactionSyncResult {
  pendingReviewCount: number;
  provider: string;
  reviewMonth: string;
  skippedBankSync: boolean;
  transactions: ExpenseTransactionPreview[];
  wroteLedgerRows: boolean;
}

async function syncExpenseTransactionsForReviewMonth({
  allowMockFallback = true,
  assetId,
  reviewMonth
}: {
  allowMockFallback?: boolean;
  assetId: string;
  reviewMonth: string;
}): Promise<ExpenseTransactionSyncResult> {
  const { startDate, endDate } = getMonthRange(reviewMonth);
  const transactionResult = allowMockFallback
    ? await fetchPropertyBankTransactions({
        assetId,
        startDate,
        endDate
      })
    : await fetchPropertyConnectedBankTransactions({
        assetId,
        startDate,
        endDate
      });

  if (!transactionResult) {
    return {
      pendingReviewCount: 0,
      provider: "",
      reviewMonth: reviewMonth.slice(0, 7),
      skippedBankSync: true,
      transactions: [],
      wroteLedgerRows: false
    };
  }

  const availableTransactions = await filterTransactionsOwnedByCurrentProperty({
    assetId,
    transactions: transactionResult.transactions
  });
  const classifications = await loadPropertyTransactionClassifications({
    assetId,
    startDate,
    endDate
  });
  const rules = await getActiveRealEstateTransactionRules(assetId);
  const decisions = getMonthlyExpenseDebitSyncDecisions({
    getClassification: (transaction) =>
      getBankTransactionClassification(classifications, transaction),
    getRuleMatch: (transaction) => {
      const matchingRule = getMatchingExpenseRule({
        assetId,
        rules,
        transaction
      });

      return matchingRule
        ? {
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
  let wroteLedgerRows = false;

  if (ruleMatchedDecisions.length > 0) {
    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      ruleMatchedDecisions.map((decision) => {
        const ruleMatch = decision.ruleMatch;

        if (!ruleMatch) {
          throw new Error("Missing transaction rule match.");
        }

        return buildPropertyTransactionLedgerRow({
          assetId,
          category: ruleMatch.category,
          classification: "expense",
          description: ruleMatch.transactionName,
          note: `Classified by rule: ${ruleMatch.name}`,
          provider: transactionResult.provider,
          rentPeriodMonth: null,
          transaction: decision.transaction,
          updatedAt: now
        });
      }),
      "Could not apply transaction rules"
    );

    wroteLedgerRows = true;
  }

  if (pendingDecisions.length > 0) {
    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      pendingDecisions.map((decision) =>
        buildPropertyTransactionLedgerRow({
          assetId,
          category: null,
          classification: null,
          note: "Needs expense review.",
          provider: transactionResult.provider,
          rentPeriodMonth: null,
          transaction: decision.transaction,
          updatedAt: now
        })
      ),
      "Could not save pending expense transactions"
    );

    wroteLedgerRows = true;
  }

  const transactions = decisions
    .filter((decision) => decision.shouldShowAsUnclassified)
    .map((decision) => ({
      id: decision.transaction.id,
      connectionId: decision.transaction.connectionId,
      rawBankTransactionId: decision.transaction.rawBankTransactionId ?? null,
      postedAt: decision.transaction.postedAt,
      description: decision.transaction.description,
      amount: decision.transaction.amount,
      accountName: decision.transaction.accountName,
      classification: null,
      recordedTransactionId: decision.classification?.id ?? null
    }));

  return {
    pendingReviewCount: transactions.length,
    provider: transactionResult.provider,
    reviewMonth: reviewMonth.slice(0, 7),
    skippedBankSync: false,
    transactions,
    wroteLedgerRows
  };
}

export async function previewRentTransactionMatches(
  assetId: string,
  _previousState: RentTransactionMatchState,
  formData: FormData
): Promise<RentTransactionMatchState> {
  void _previousState;

  try {
    const matchMonth = readMonthStart(formData, "matchMonth");

    if (await isMonthlyReviewClosed({ assetId, reviewMonth: matchMonth })) {
      return {
        status: "error",
        message: "Reopen this monthly review before finding rent income.",
        provider: "",
        matchMonth: matchMonth.slice(0, 7),
        matches: []
      };
    }

    const result = await syncRentCreditsForReviewMonth({
      assetId,
      matchMonth
    });

    if (result.wroteLedgerRows) {
      revalidatePropertyPages(assetId);
    }

    if (result.skippedBankSync) {
      return {
        status: "success",
        message: "No bank connection. Connect account to review transactions.",
        provider: "",
        matchMonth: result.matchMonth,
        matches: []
      };
    }

    const messageParts = [
      result.autoMatchedCount > 0
        ? `${result.autoMatchedCount} rental income ${result.autoMatchedCount === 1 ? "credit was" : "credits were"} auto-recorded.`
        : "",
      result.pendingReviewCount > 0
        ? `${result.pendingReviewCount} credit ${result.pendingReviewCount === 1 ? "needs" : "need"} review.`
        : "",
      result.matches.length > 0 &&
      result.pendingReviewCount === 0 &&
      result.autoMatchedCount === 0
        ? "All reviewed credits are already classified."
        : "",
      result.matches.length === 0 ? "No credit transactions over $10 found." : ""
    ].filter(Boolean);

    return {
      status: "success",
      message: messageParts.join(" "),
      provider: result.provider,
      matchMonth: result.matchMonth,
      matches: result.matches
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not preview rent transaction matches.",
      provider: "",
      matchMonth: "",
      matches: []
    };
  }
}

export async function classifyRentCreditTransaction(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;

  try {
    const transactionId = readText(formData, "transactionId");
    const connectionId = readText(formData, "connectionId");
    const rawBankTransactionId = readText(formData, "rawBankTransactionId");
    const recordedTransactionId = readText(formData, "recordedTransactionId");
    const matchMonth = readMonthStart(formData, "matchMonth");
    const classification = readText(formData, "classification");
    if (classification !== "rental_income" && classification !== "ignored") {
      return errorState("Choose whether this credit is rental income or not rental income.");
    }

    const requestedRentPeriodMonth = readText(formData, "rentPeriodMonth");
    const rentPeriodMonth = requestedRentPeriodMonth
      ? readMonthStart(formData, "rentPeriodMonth")
      : matchMonth;

    await assertMonthlyReviewIsOpen({ assetId, reviewMonth: matchMonth });

    if (rentPeriodMonth !== matchMonth) {
      await assertMonthlyReviewIsOpen({ assetId, reviewMonth: rentPeriodMonth });
    }

    if (
      !recordedTransactionId &&
      !rawBankTransactionId &&
      (!transactionId || !connectionId)
    ) {
      return errorState("Choose a credit to classify.");
    }

    if (recordedTransactionId) {
      const now = new Date().toISOString();
      const supabase = createServerSupabaseClient();
      const { data: existingTransaction, error: loadError } = await supabase
        .from("real_estate_property_transactions")
        .select("asset_id, direction, posted_at, rent_period_month")
        .eq("id", recordedTransactionId)
        .eq("asset_id", assetId)
        .eq("direction", "credit")
        .single();

      if (loadError) {
        return errorState(`Could not load rent credit: ${loadError.message}`);
      }

      await assertPropertyTransactionOwnerReviewIsOpen(
        existingTransaction as PropertyTransactionReviewOwnerRow
      );

      const { data, error } = await supabase
        .from("real_estate_property_transactions")
        .update({
          classification,
          category: null,
          rent_period_month: rentPeriodMonth,
          note:
            classification === "rental_income"
              ? "Marked as rental income."
              : "Marked as not rental income.",
          updated_at: now
        })
        .eq("id", recordedTransactionId)
        .eq("asset_id", assetId)
        .eq("direction", "credit")
        .select("id");

      if (error) {
        return errorState(`Could not save rent credit: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return errorState("That credit transaction could not be found.");
      }

      revalidatePropertyPages(assetId);
      return successState(
        classification === "rental_income"
          ? "Rental income recorded."
          : "Credit marked as not rental income."
      );
    }

    if (rawBankTransactionId) {
      await assertRawBankTransactionLedgerOwnerIsOpen(rawBankTransactionId);
    }

    let provider: BankTransactionProviderName = "plaid";
    let matchedTransaction = rawBankTransactionId
      ? await loadRawBankTransaction(rawBankTransactionId)
      : null;

    if (!matchedTransaction) {
      const { startDate, endDate } = getBufferedMonthRange(
        matchMonth,
        RENT_TRANSACTION_SEARCH_BUFFER_DAYS
      );
      const result = await fetchPropertyBankTransactions({
        assetId,
        startDate,
        endDate
      });

      if (!result) {
        return errorState("No bank connection. Connect account to review transactions.");
      }

      provider = result.provider;
      matchedTransaction =
        result.transactions.find(
          (transaction) =>
            transaction.id === transactionId &&
            transaction.connectionId === connectionId &&
            isReviewableRentCredit(transaction)
        ) ?? null;
    }

    if (!matchedTransaction) {
      return errorState("That credit transaction could not be found.");
    }

    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      [
        buildPropertyTransactionLedgerRow({
          assetId,
          category: null,
          classification,
          note:
            classification === "rental_income"
              ? "Marked as rental income."
              : "Marked as not rental income.",
          provider,
          rentPeriodMonth,
          transaction: matchedTransaction,
          updatedAt: now
        })
      ],
      "Could not save rent credit"
    );

    revalidatePropertyPages(assetId);
    return successState(
      classification === "rental_income"
        ? "Rental income recorded."
        : "Credit marked as not rental income."
    );
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "Could not classify rent credit."
    );
  }
}

export async function previewExpenseTransactions(
  assetId: string,
  _previousState: ExpenseTransactionPreviewState,
  formData: FormData
): Promise<ExpenseTransactionPreviewState> {
  void _previousState;

  try {
    const reviewMonth = readMonthStart(formData, "reviewMonth");

    if (await isMonthlyReviewClosed({ assetId, reviewMonth })) {
      return {
        status: "error",
        message: "Reopen this monthly review before finding transactions.",
        provider: "",
        reviewMonth: reviewMonth.slice(0, 7),
        transactions: []
      };
    }

    const result = await syncExpenseTransactionsForReviewMonth({
      assetId,
      reviewMonth
    });

    if (result.wroteLedgerRows) {
      revalidatePropertyPages(assetId);
    }

    if (result.skippedBankSync) {
      return {
        status: "success",
        message: "No bank connection. Connect account to review transactions.",
        provider: "",
        reviewMonth: result.reviewMonth,
        transactions: []
      };
    }

    return {
      status: "success",
      message:
        result.transactions.length > 0
          ? `${result.transactions.length} expense ${result.transactions.length === 1 ? "transaction" : "transactions"} found.`
          : "No unclassified expense transactions found.",
      provider: result.provider,
      reviewMonth: result.reviewMonth,
      transactions: result.transactions
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not preview expenses.",
      provider: "",
      reviewMonth: "",
      transactions: []
    };
  }
}

function readTransactionClassification(formData: FormData): RealEstateTransactionClassification {
  const classification = readText(
    formData,
    "classification"
  ) as RealEstateTransactionClassification;

  if (classification !== "expense" && classification !== "ignored") {
    throw new Error("Choose whether this transaction is an expense or ignored.");
  }

  return classification;
}

export async function classifyPropertyTransaction(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;

  try {
    const transactionId = readText(formData, "transactionId");
    const connectionId = readText(formData, "connectionId");
    const rawBankTransactionId = readText(formData, "rawBankTransactionId");
    const recordedTransactionId = readText(formData, "recordedTransactionId");
    const reviewMonth = readMonthStart(formData, "reviewMonth");
    const targetAssetId = readText(formData, "targetAssetId") || assetId;
    const classification = readTransactionClassification(formData);
    const category = classification === "expense" ? readExpenseCategory(formData) : null;
    const note = readText(formData, "note") || null;

    await assertMonthlyReviewIsOpen({ assetId, reviewMonth });

    if (targetAssetId !== assetId) {
      await assertMonthlyReviewIsOpen({
        assetId: targetAssetId,
        reviewMonth
      });
    }

    if (
      !recordedTransactionId &&
      !rawBankTransactionId &&
      (!transactionId || !connectionId)
    ) {
      return errorState("Choose a transaction to classify.");
    }

    if (recordedTransactionId) {
      const now = new Date().toISOString();
      const supabase = createServerSupabaseClient();
      const { data: existingTransaction, error: loadError } = await supabase
        .from("real_estate_property_transactions")
        .select("asset_id, direction, posted_at, rent_period_month")
        .eq("id", recordedTransactionId)
        .eq("asset_id", assetId)
        .eq("direction", "debit")
        .single();

      if (loadError) {
        return errorState(`Could not load transaction: ${loadError.message}`);
      }

      const existingTransactionRow =
        existingTransaction as PropertyTransactionReviewOwnerRow;
      const existingReviewMonth = getPropertyTransactionReviewMonth(
        existingTransactionRow
      );

      await assertPropertyTransactionOwnerReviewIsOpen(existingTransactionRow);

      if (existingReviewMonth !== reviewMonth) {
        if (targetAssetId !== assetId) {
          await assertMonthlyReviewIsOpen({
            assetId: targetAssetId,
            reviewMonth: existingReviewMonth
          });
        }
      }

      const { data, error } = await supabase
        .from("real_estate_property_transactions")
        .update({
          asset_id: targetAssetId,
          category,
          classification,
          note:
            note ??
            (classification === "expense"
              ? "Marked as expense."
              : "Marked as ignored."),
          updated_at: now
        })
        .eq("id", recordedTransactionId)
        .eq("asset_id", assetId)
        .eq("direction", "debit")
        .select("id");

      if (error) {
        return errorState(`Could not save transaction: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return errorState("That expense transaction could not be found.");
      }

      revalidatePropertyPages(assetId);
      revalidatePropertyPages(targetAssetId);
      return successState(
        classification === "expense" ? "Expense recorded." : "Transaction ignored."
      );
    }

    if (rawBankTransactionId) {
      await assertRawBankTransactionLedgerOwnerIsOpen(rawBankTransactionId);
    }

    let provider: BankTransactionProviderName = "plaid";
    let transaction = rawBankTransactionId
      ? await loadRawBankTransaction(rawBankTransactionId)
      : null;

    if (!transaction) {
      const { startDate, endDate } = getMonthRange(reviewMonth);
      const result = await fetchPropertyBankTransactions({
        assetId,
        startDate,
        endDate
      });

      if (!result) {
        return errorState("No bank connection. Connect account to review transactions.");
      }

      provider = result.provider;
      transaction =
        result.transactions.find(
          (item) => item.id === transactionId && item.connectionId === connectionId
        ) ?? null;
    }

    if (!transaction || transaction.direction !== "debit") {
      return errorState("That expense transaction could not be found.");
    }

    const now = new Date().toISOString();
    await upsertPropertyTransactionLedgerRows(
      [
        buildPropertyTransactionLedgerRow({
          assetId: targetAssetId,
          category,
          classification,
          note,
          provider,
          rentPeriodMonth: null,
          transaction,
          updatedAt: now
        })
      ],
      "Could not save transaction"
    );

    revalidatePropertyPages(assetId);
    revalidatePropertyPages(targetAssetId);
    return successState(
      classification === "expense" ? "Expense recorded." : "Transaction ignored."
    );
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not classify transaction.");
  }
}

function getMonthlyCloseBlockedMessage(
  assessment: ReturnType<typeof getMonthlyReviewAssessment>
): string {
  const blockers = [
    !assessment.isReviewMonthComplete ? "review month is still in progress" : "",
    assessment.rentStatus === "needs_review" ? "rent is not ready" : "",
    assessment.unclassifiedRentCreditCount > 0
      ? `${assessment.unclassifiedRentCreditCount} credit ${assessment.unclassifiedRentCreditCount === 1 ? "needs" : "need"} rent review`
      : "",
    assessment.unclassifiedExpenseCount > 0
      ? `${assessment.unclassifiedExpenseCount} debit ${assessment.unclassifiedExpenseCount === 1 ? "transaction is" : "transactions are"} unclassified`
      : "",
    assessment.missingExpenseCategoryCount > 0
      ? `${assessment.missingExpenseCategoryCount} expense ${assessment.missingExpenseCategoryCount === 1 ? "transaction is" : "transactions are"} missing a category`
      : ""
  ].filter(Boolean);

  return `Could not close ${assessment.reviewMonth}: ${blockers.join("; ")}.`;
}

export async function closeMonthlyReview(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;
  let wroteLedgerRows = false;

  try {
    const reviewMonth = readMonthStart(formData, "reviewMonth");
    const note = readText(formData, "note") || null;
    const currentProperty = await getRealEstateAssetDetail(assetId);

    if (!currentProperty) {
      return errorState("Could not close month: property was not found.");
    }

    const currentAssessment = getMonthlyReviewAssessment(currentProperty, reviewMonth);

    if (currentAssessment.closedAt) {
      return successState("Month is already closed.");
    }

    if (!currentAssessment.isReviewMonthComplete) {
      return errorState(getMonthlyCloseBlockedMessage(currentAssessment));
    }

    if (currentProperty.rentalStatus === "rented" && currentProperty.monthlyRent > 0) {
      const rentSyncResult = await syncRentCreditsForReviewMonth({
        allowMockFallback: false,
        assetId,
        matchMonth: reviewMonth
      });

      wroteLedgerRows ||= rentSyncResult.wroteLedgerRows;
    }

    const expenseSyncResult = await syncExpenseTransactionsForReviewMonth({
      allowMockFallback: false,
      assetId,
      reviewMonth
    });

    wroteLedgerRows ||= expenseSyncResult.wroteLedgerRows;

    if (wroteLedgerRows) {
      revalidatePropertyPages(assetId);
    }

    const property = await getRealEstateAssetDetail(assetId);

    if (!property) {
      return errorState("Could not close month: property was not found.");
    }

    const assessment = getMonthlyReviewAssessment(property, reviewMonth);

    if (!assessment.isReadyToClose) {
      return errorState(getMonthlyCloseBlockedMessage(assessment));
    }

    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_monthly_reviews").upsert(
      {
        asset_id: assetId,
        review_month: assessment.reviewMonthDate,
        rent_status: assessment.rentStatus,
        expense_status: assessment.expenseStatus,
        closed_at: now,
        note,
        updated_at: now
      },
      {
        onConflict: "asset_id,review_month"
      }
    );

    if (error) {
      return errorState(`Could not close month: ${error.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("");
  } catch (error) {
    if (wroteLedgerRows) {
      revalidatePropertyPages(assetId);
    }

    return errorState(error instanceof Error ? error.message : "Could not close month.");
  }
}

export async function reopenMonthlyReview(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;

  try {
    const reviewMonth = readMonthStart(formData, "reviewMonth");
    const property = await getRealEstateAssetDetail(assetId);

    if (!property) {
      return errorState("Could not reopen month: property was not found.");
    }

    const assessment = getMonthlyReviewAssessment(property, reviewMonth);
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("real_estate_monthly_reviews")
      .update({
        rent_status: assessment.rentStatus,
        expense_status: assessment.expenseStatus,
        closed_at: null,
        updated_at: now
      })
      .eq("asset_id", assetId)
      .eq("review_month", assessment.reviewMonthDate)
      .select("id");

    if (error) {
      return errorState(`Could not reopen month: ${error.message}`);
    }

    if (!data || data.length === 0) {
      const { error: insertError } = await supabase
        .from("real_estate_monthly_reviews")
        .insert({
          asset_id: assetId,
          review_month: assessment.reviewMonthDate,
          rent_status: assessment.rentStatus,
          expense_status: assessment.expenseStatus,
          closed_at: null,
          note: null,
          updated_at: now
        });

      if (insertError) {
        return errorState(`Could not reopen month: ${insertError.message}`);
      }
    }

    revalidatePropertyPages(assetId);
    return successState("");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not reopen month.");
  }
}

export async function syncPropertyValuation(
  assetId: string,
  _previousState: RealEstateActionState,
  _formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;
  void _formData;

  try {
    const usageStatus = await getPropertyValuationUsageStatus();

    if (
      usageStatus.isLiveProvider &&
      (!usageStatus.isTrackingAvailable || usageStatus.isLimitReached)
    ) {
      return errorState(
        usageStatus.message ??
          `Monthly live valuation limit reached (${usageStatus.used}/${usageStatus.limit}).`
      );
    }

    const property = await loadPropertyValuationInput(assetId);
    const address = normalizePropertyAddress(property.address);

    if (!address) {
      return errorState("Address is required before syncing property value.");
    }

    const valuation = await fetchPropertyValuation({
      assetId,
      address,
      purchasePrice: Number(property.purchase_price),
      currentMarketValue: Number(property.current_market_value)
    });

    if (valuation.source === "provider") {
      await recordPropertyValuationUsage(assetId, valuation.syncedAt);
    }

    await savePropertyValuation(assetId, valuation.value, valuation.syncedAt, valuation.source);
    const supabase = createServerSupabaseClient();

    const { error: snapshotError } = await supabase.from("real_estate_metric_snapshots").upsert(
      {
        asset_id: assetId,
        metric_type: "current_market_value",
        value: valuation.value,
        recorded_at: valuation.syncedAt.slice(0, 10),
        source: valuation.source,
        note: valuation.note
      },
      {
        onConflict: "asset_id,metric_type,recorded_at"
      }
    );

    if (snapshotError) {
      return errorState(`Property value synced, but snapshot failed: ${snapshotError.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState(
      valuation.source === "mock"
        ? "Mock property value synced. Choose a valuation provider for live data."
        : "Property value synced."
    );
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not sync property value.");
  }
}

function getPhotoFile(formData: FormData): File {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a photo to upload.");
  }

  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    throw new Error("Photo must be JPEG, PNG, WebP, or GIF.");
  }

  if (file.size > MAX_PHOTO_SIZE) {
    throw new Error("Photo must be 10 MB or smaller.");
  }

  return file;
}

function getSafeFileName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  return `${randomUUID()}.${extension.replace(/[^a-z0-9]/g, "") || "jpg"}`;
}

export async function uploadPropertyPhoto(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const file = getPhotoFile(formData);
    const caption = readText(formData, "caption") || null;
    const storagePath = `${assetId}/${getSafeFileName(file.name)}`;
    const supabase = createServerSupabaseClient();

    const { error: uploadError } = await supabase.storage
      .from(PROPERTY_PHOTO_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      return errorState(`Could not upload photo: ${uploadError.message}`);
    }

    const { count } = await supabase
      .from("real_estate_photos")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);

    const { error: insertError } = await supabase.from("real_estate_photos").insert({
      asset_id: assetId,
      storage_path: storagePath,
      caption,
      sort_order: count ?? 0,
      is_cover: (count ?? 0) === 0
    });

    if (insertError) {
      await supabase.storage.from(PROPERTY_PHOTO_BUCKET).remove([storagePath]);
      return errorState(`Could not save photo: ${insertError.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("Photo uploaded.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not upload photo.");
  }
}

export async function deletePropertyPhoto(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const photoId = readText(formData, "photoId");
  const storagePath = readText(formData, "storagePath");

  if (!assetId || !photoId || !storagePath) {
    throw new Error("Missing photo information.");
  }

  const supabase = createServerSupabaseClient();
  const { error: deleteError } = await supabase
    .from("real_estate_photos")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    throw new Error(`Could not delete photo: ${deleteError.message}`);
  }

  await supabase.storage.from(PROPERTY_PHOTO_BUCKET).remove([storagePath]);
  revalidatePropertyPages(assetId);
}

export async function setCoverPhoto(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const photoId = readText(formData, "photoId");

  if (!assetId || !photoId) {
    throw new Error("Missing photo information.");
  }

  const supabase = createServerSupabaseClient();
  const { error: resetError } = await supabase
    .from("real_estate_photos")
    .update({ is_cover: false })
    .eq("asset_id", assetId);

  if (resetError) {
    throw new Error(`Could not update cover photo: ${resetError.message}`);
  }

  const { error: coverError } = await supabase
    .from("real_estate_photos")
    .update({ is_cover: true })
    .eq("id", photoId);

  if (coverError) {
    throw new Error(`Could not update cover photo: ${coverError.message}`);
  }

  revalidatePropertyPages(assetId);
}

function readMetricType(formData: FormData): RealEstateMetricType {
  const metricType = readText(formData, "metricType") as RealEstateMetricType;

  if (!Object.keys(snapshotMetricLabels).includes(metricType)) {
    throw new Error("Choose a supported metric.");
  }

  return metricType;
}

export async function addMetricSnapshot(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  try {
    const metricType = readMetricType(formData);
    const recordedAt = readText(formData, "recordedAt");
    const note = readText(formData, "note") || null;

    if (!recordedAt) {
      throw new Error("Snapshot date is required.");
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_metric_snapshots").upsert(
      {
        asset_id: assetId,
        metric_type: metricType,
        value: readMoney(formData, "value"),
        recorded_at: recordedAt,
        source: "manual",
        note
      },
      {
        onConflict: "asset_id,metric_type,recorded_at"
      }
    );

    if (error) {
      return errorState(`Could not save snapshot: ${error.message}`);
    }

    revalidatePropertyPages(assetId);
    return successState("Snapshot saved.");
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not save snapshot.");
  }
}

export async function deleteMetricSnapshot(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const snapshotId = readText(formData, "snapshotId");

  if (!assetId || !snapshotId) {
    throw new Error("Missing snapshot information.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("real_estate_metric_snapshots")
    .delete()
    .eq("id", snapshotId);

  if (error) {
    throw new Error(`Could not delete snapshot: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}

export async function unclassifyPropertyTransaction(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const transactionId = readText(formData, "transactionId");

  if (!assetId || !transactionId) {
    throw new Error("Missing transaction information.");
  }

  const supabase = createServerSupabaseClient();
  const { data: transaction, error: loadError } = await supabase
    .from("real_estate_property_transactions")
    .select("id, direction, posted_at, rent_period_month")
    .eq("asset_id", assetId)
    .eq("id", transactionId)
    .single();

  if (loadError) {
    throw new Error(`Could not load transaction: ${loadError.message}`);
  }

  const transactionRow = transaction as {
    direction: "credit" | "debit";
    posted_at: string;
    rent_period_month: string | null;
  };
  const direction = transactionRow.direction;
  const reviewMonth =
    direction === "credit"
      ? (transactionRow.rent_period_month ?? transactionRow.posted_at)
      : transactionRow.posted_at;

  await assertMonthlyReviewIsOpen({
    assetId,
    reviewMonth: `${reviewMonth.slice(0, 7)}-01`
  });

  const { error } = await supabase
    .from("real_estate_property_transactions")
    .update({
      category: null,
      classification: null,
      note: direction === "credit" ? "Needs rent review." : "Needs expense review.",
      updated_at: new Date().toISOString()
    })
    .eq("asset_id", assetId)
    .eq("id", transactionId);

  if (error) {
    throw new Error(`Could not update transaction: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}

export async function deletePropertyTransaction(formData: FormData) {
  const assetId = readText(formData, "assetId");
  const transactionId = readText(formData, "transactionId");

  if (!assetId || !transactionId) {
    throw new Error("Missing transaction information.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("real_estate_property_transactions")
    .delete()
    .eq("asset_id", assetId)
    .eq("id", transactionId);

  if (error) {
    throw new Error(`Could not delete transaction: ${error.message}`);
  }

  revalidatePropertyPages(assetId);
}
