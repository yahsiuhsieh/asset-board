"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { normalizePropertyAddress } from "@/lib/addresses";
import {
  fetchBankTransactions,
  getTellerConnectionAccounts,
  type BankTransaction,
  type BankTransactionProviderName
} from "@/lib/banking/transaction-provider";
import { getRealEstateAssetDetail } from "@/lib/real-estate";
import { snapshotMetricLabels } from "@/lib/real-estate-history";
import {
  getMonthlyReviewAssessment,
  RENT_TRANSACTION_SEARCH_BUFFER_DAYS
} from "@/lib/real-estate-monthly-review";
import {
  getMonthlyExpenseDebitSyncDecisions,
  getMonthlyRentCreditSyncDecisions
} from "@/lib/real-estate-monthly-transaction-sync";
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

export interface RealEstateActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export interface RentTransactionMatch {
  id: string;
  connectionId: string;
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
  status: string;
}

interface PropertyTransactionClassificationRow {
  id: string;
  bank_connection_id: string | null;
  provider_transaction_id: string;
  account_id: string;
  classification: RealEstateTransactionClassification | null;
  category: RealEstateExpenseCategory | null;
  rent_period_month: string | null;
  note: string | null;
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

async function loadPropertyBankConnections(
  assetId: string
): Promise<PropertyBankConnectionRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("real_estate_bank_connections")
    .select("id, provider, access_token, account_id, account_name, status")
    .eq("asset_id", assetId)
    .eq("status", "active")
    .order("account_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load bank connections: ${error.message}`);
  }

  return (data ?? []) as PropertyBankConnectionRow[];
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
  const transactionGroups = await Promise.all(
    connections.map((connection) =>
      fetchBankTransactions({
        startDate,
        endDate,
        expectedRentAmount,
        tellerAccessToken: connection.access_token,
        tellerAccountId: connection.account_id,
        tellerAccountName: connection.account_name,
        bankConnectionId: connection.id,
        bankProvider: connection.provider === "teller" ? "teller" : null
      })
    )
  );

  return {
    provider: transactionGroups.find((group) => group.provider === "teller")?.provider ?? "mock",
    transactions: transactionGroups.flatMap((group) => group.transactions)
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
    return fetchBankTransactions({
      startDate,
      endDate,
      expectedRentAmount
    });
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
      bank_connection_id,
      provider_transaction_id,
      account_id,
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
    rows.map((row) => [
      getTransactionClassificationKey({
        connectionId: row.bank_connection_id,
        accountId: row.account_id,
        transactionId: row.provider_transaction_id
      }),
      row
    ])
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
  note,
  provider,
  rentPeriodMonth,
  transaction,
  updatedAt
}: {
  assetId: string;
  category: RealEstateExpenseCategory | null;
  classification: RealEstateTransactionClassification | null;
  note: string | null;
  provider: BankTransactionProviderName;
  rentPeriodMonth: string | null;
  transaction: BankTransaction;
  updatedAt: string;
}) {
  return {
    asset_id: assetId,
    bank_connection_id: getLedgerBankConnectionId(transaction),
    provider,
    provider_transaction_id: transaction.id,
    account_id: transaction.accountId,
    account_name: transaction.accountName,
    posted_at: transaction.postedAt,
    description: transaction.description,
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
      current_market_value_source: "mock",
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

export async function updateRentMatchingSettings(
  assetId: string,
  _previousState: RealEstateActionState,
  formData: FormData
): Promise<RealEstateActionState> {
  void _previousState;

  try {
    const rentMatchTolerance = readMoney(formData, "rentMatchTolerance");
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("real_estate_properties")
      .update({
        rent_match_tolerance: rentMatchTolerance,
        updated_at: now
      })
      .eq("asset_id", assetId)
      .select("asset_id")
      .single();

    if (error) {
      return errorState(`Could not update rent matching settings: ${error.message}`);
    }

    if (!data) {
      return errorState(
        "Could not update rent matching settings: no matching property was found."
      );
    }

    revalidatePropertyPages(assetId);
    return successState("Rent matching settings updated.");
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "Could not update rent matching settings."
    );
  }
}

export async function connectTellerBank(
  assetId: string,
  accessToken: string
): Promise<RealEstateActionState> {
  try {
    const token = accessToken.trim();

    if (!token) {
      return errorState("Teller access token is missing.");
    }

    const accounts = await getTellerConnectionAccounts(token);
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const rows = accounts.map((account) => ({
      asset_id: assetId,
      provider: "teller",
      access_token: token,
      enrollment_id: account.enrollmentId,
      account_id: account.accountId,
      account_name: account.accountName,
      account_type: account.accountType,
      account_subtype: account.accountSubtype,
      institution_name: account.institutionName,
      institution_id: account.institutionId,
      last_four: account.lastFour,
      status: "active",
      connected_at: now,
      updated_at: now
    }));
    const { data, error } = await supabase
      .from("real_estate_bank_connections")
      .upsert(rows, {
        onConflict: "asset_id,provider,account_id"
      })
      .select("id, account_name");

    if (error) {
      return errorState(`Could not save Teller connection: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return errorState("Could not save Teller connection: no bank accounts were found.");
    }

    revalidatePropertyPages(assetId);
    return successState(
      `${data.length} bank ${data.length === 1 ? "account" : "accounts"} connected.`
    );
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Could not connect bank.");
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
    transactions: transactionResult.transactions
  });
  const autoMatchedDecisions = decisions.filter(
    (decision) => decision.shouldAutoRecordRentalIncome
  );
  let wroteLedgerRows = false;

  if (autoMatchedDecisions.length > 0) {
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_property_transactions").upsert(
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
      {
        onConflict: "asset_id,provider,account_id,provider_transaction_id"
      }
    );

    if (error) {
      throw new Error(`Could not auto-record rental income: ${error.message}`);
    }

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
      transactions: transactionResult.transactions
    });
  }

  const pendingDecisions = decisions.filter(
    (decision) => decision.shouldCreatePendingReview
  );

  if (pendingDecisions.length > 0) {
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("real_estate_property_transactions")
      .upsert(
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
        {
          onConflict: "asset_id,provider,account_id,provider_transaction_id"
        }
      );

    if (error) {
      throw new Error(`Could not save pending rent credits: ${error.message}`);
    }

    wroteLedgerRows = true;
  }

  const matches = decisions.map((decision) => ({
    id: decision.transaction.id,
    connectionId: decision.transaction.connectionId,
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

  const classifications = await loadPropertyTransactionClassifications({
    assetId,
    startDate,
    endDate
  });
  const decisions = getMonthlyExpenseDebitSyncDecisions({
    getClassification: (transaction) =>
      getBankTransactionClassification(classifications, transaction),
    transactions: transactionResult.transactions
  });
  const pendingDecisions = decisions.filter(
    (decision) => decision.shouldCreatePendingReview
  );
  let wroteLedgerRows = false;

  if (pendingDecisions.length > 0) {
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("real_estate_property_transactions")
      .upsert(
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
        {
          onConflict: "asset_id,provider,account_id,provider_transaction_id"
        }
      );

    if (error) {
      throw new Error(`Could not save pending expense transactions: ${error.message}`);
    }

    wroteLedgerRows = true;
  }

  const transactions = decisions
    .filter((decision) => decision.shouldShowAsUnclassified)
    .map((decision) => ({
      id: decision.transaction.id,
      connectionId: decision.transaction.connectionId,
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
    const result = await syncRentCreditsForReviewMonth({
      assetId,
      matchMonth
    });

    if (result.wroteLedgerRows) {
      revalidatePropertyPages(assetId);
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
    const recordedTransactionId = readText(formData, "recordedTransactionId");
    const matchMonth = readMonthStart(formData, "matchMonth");
    const classification = readText(formData, "classification");
    const rentPeriodMonth =
      classification === "rental_income"
        ? readMonthStart(formData, "rentPeriodMonth")
        : null;

    if (!recordedTransactionId && (!transactionId || !connectionId)) {
      return errorState("Choose a credit to classify.");
    }

    if (classification !== "rental_income" && classification !== "ignored") {
      return errorState("Choose whether this credit is rental income or not rental income.");
    }

    if (recordedTransactionId) {
      const now = new Date().toISOString();
      const supabase = createServerSupabaseClient();
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

    const { startDate, endDate } = getBufferedMonthRange(
      matchMonth,
      RENT_TRANSACTION_SEARCH_BUFFER_DAYS
    );
    const result = await fetchPropertyBankTransactions({
      assetId,
      startDate,
      endDate
    });
    const matchedTransaction = result.transactions.find(
      (transaction) =>
        transaction.id === transactionId &&
        transaction.connectionId === connectionId &&
        isReviewableRentCredit(transaction)
    );

    if (!matchedTransaction) {
      return errorState("That credit transaction could not be found.");
    }

    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_property_transactions").upsert(
      buildPropertyTransactionLedgerRow({
        assetId,
        category: null,
        classification,
        note:
          classification === "rental_income"
            ? "Marked as rental income."
            : "Marked as not rental income.",
        provider: result.provider,
        rentPeriodMonth,
        transaction: matchedTransaction,
        updatedAt: now
      }),
      {
        onConflict: "asset_id,provider,account_id,provider_transaction_id"
      }
    );

    if (error) {
      return errorState(`Could not save rent credit: ${error.message}`);
    }

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
    const result = await syncExpenseTransactionsForReviewMonth({
      assetId,
      reviewMonth
    });

    if (result.wroteLedgerRows) {
      revalidatePropertyPages(assetId);
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
    const reviewMonth = readMonthStart(formData, "reviewMonth");
    const classification = readTransactionClassification(formData);
    const category = classification === "expense" ? readExpenseCategory(formData) : null;
    const note = readText(formData, "note") || null;

    if (!transactionId || !connectionId) {
      return errorState("Choose a transaction to classify.");
    }

    const { startDate, endDate } = getMonthRange(reviewMonth);
    const result = await fetchPropertyBankTransactions({
      assetId,
      startDate,
      endDate
    });
    const transaction = result.transactions.find(
      (item) => item.id === transactionId && item.connectionId === connectionId
    );

    if (!transaction || transaction.direction !== "debit") {
      return errorState("That expense transaction could not be found.");
    }

    const provider: BankTransactionProviderName = result.provider;
    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("real_estate_property_transactions").upsert(
      {
        asset_id: assetId,
        bank_connection_id: getLedgerBankConnectionId(transaction),
        provider,
        provider_transaction_id: transaction.id,
        account_id: transaction.accountId,
        account_name: transaction.accountName,
        posted_at: transaction.postedAt,
        description: transaction.description,
        memo: transaction.memo || null,
        amount: transaction.amount,
        direction: transaction.direction,
        classification,
        category,
        rent_period_month: null,
        note,
        updated_at: now
      },
      {
        onConflict: "asset_id,provider,account_id,provider_transaction_id"
      }
    );

    if (error) {
      return errorState(`Could not save transaction: ${error.message}`);
    }

    revalidatePropertyPages(assetId);
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
