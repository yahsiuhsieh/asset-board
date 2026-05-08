import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
  type LinkTokenCreateRequest,
  type Transaction
} from "plaid";

export type BankTransactionProviderName = "mock" | "plaid";
export type BankTransactionDirection = "credit" | "debit";

export interface BankTransaction {
  id: string;
  connectionId: string;
  postedAt: string;
  title: string;
  memo: string;
  description: string;
  amount: number;
  direction: BankTransactionDirection;
  accountId: string;
  accountName: string;
}

export interface BankTransactionQuery {
  startDate: string;
  endDate: string;
  expectedRentAmount?: number;
  plaidAccessToken?: string | null;
  plaidAccountId?: string | null;
  plaidAccountName?: string | null;
  bankConnectionId?: string | null;
  bankProvider?: BankTransactionProviderName | null;
}

export interface BankTransactionProviderResult {
  provider: BankTransactionProviderName;
  transactions: BankTransaction[];
}

export interface PlaidConnectionAccount {
  accountId: string;
  accountName: string;
  accountType: string | null;
  accountSubtype: string | null;
  institutionId: string | null;
  institutionName: string | null;
  lastFour: string | null;
  providerItemId: string;
}

export interface PlaidConnectionAccountLike {
  account_id: string;
  mask?: string | null;
  name: string;
  official_name?: string | null;
  subtype?: string | null;
  type?: string | null;
}

export interface PlaidConnectionItemLike {
  institution_id?: string | null;
  institution_name?: string | null;
  item_id: string;
}

export interface PlaidTransactionLike {
  account_id: string;
  amount: number;
  date: string;
  merchant_name?: string | null;
  name: string;
  original_description?: string | null;
  pending?: boolean | null;
  transaction_id: string;
}

export interface PlaidItemHealth {
  errorCode: string | null;
  errorMessage: string | null;
  status: "active" | "disconnected";
}

const DEFAULT_PLAID_TRANSACTIONS_DAYS_REQUESTED = 365;
const PLAID_TRANSACTION_PAGE_SIZE = 500;
const PLAID_DISCONNECTED_ITEM_ERROR_CODES = new Set([
  "ACCESS_NOT_GRANTED",
  "INSUFFICIENT_CREDENTIALS",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ITEM_LOCKED",
  "ITEM_LOGIN_REQUIRED",
  "ITEM_NOT_FOUND",
  "PASSWORD_RESET_REQUIRED",
  "USER_ACCOUNT_REVOKED",
  "USER_PERMISSION_REVOKED",
  "USER_SETUP_REQUIRED"
]);

export class PlaidItemDisconnectedError extends Error {
  errorCode: string;

  constructor(errorCode: string, message: string) {
    super(message);
    this.name = "PlaidItemDisconnectedError";
    this.errorCode = errorCode;
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function createMockBankProviderError(): never {
  throw new Error(
    "Mock bank transactions are disabled in production. Connect a bank account to review transactions."
  );
}

function createMissingBankProviderError(): never {
  throw new Error(
    "Bank transaction provider is not configured. Connect a bank account to review transactions."
  );
}

function createPlaidConfigError(message: string): never {
  throw new Error(`Plaid is not configured. ${message}`);
}

export function getConfiguredBankTransactionProvider(): BankTransactionProviderName | null {
  const provider = process.env.BANK_TRANSACTION_PROVIDER?.trim().toLowerCase();

  if (provider === "plaid") {
    return "plaid";
  }

  if (provider === "mock") {
    if (isProductionRuntime()) {
      return createMockBankProviderError();
    }

    return "mock";
  }

  return null;
}

function getPlaidRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    return createPlaidConfigError(`Set ${name}.`);
  }

  return value;
}

function getPlaidEnvironmentBasePath(): string {
  const environment = process.env.PLAID_ENV?.trim().toLowerCase() || "sandbox";

  if (environment === "sandbox") {
    return PlaidEnvironments.sandbox;
  }

  if (environment === "production") {
    return PlaidEnvironments.production;
  }

  return createPlaidConfigError("PLAID_ENV must be sandbox or production.");
}

function createPlaidClient(): PlaidApi {
  const clientId = getPlaidRequiredEnv("PLAID_CLIENT_ID");
  const secret = getPlaidRequiredEnv("PLAID_SECRET");

  return new PlaidApi(
    new Configuration({
      basePath: getPlaidEnvironmentBasePath(),
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret
        }
      }
    })
  );
}

function getPlaidCountryCodes(): CountryCode[] {
  const rawValue = process.env.PLAID_COUNTRY_CODES?.trim() || "US";
  const supportedCodes = new Set(Object.values(CountryCode));
  const codes = rawValue
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  if (codes.length === 0) {
    return createPlaidConfigError("PLAID_COUNTRY_CODES must include at least one country code.");
  }

  return codes.map((code) => {
    if (!supportedCodes.has(code as CountryCode)) {
      return createPlaidConfigError(`Unsupported PLAID_COUNTRY_CODES value: ${code}.`);
    }

    return code as CountryCode;
  });
}

function getPlaidRedirectUri(): string {
  return getPlaidRequiredEnv("PLAID_REDIRECT_URI");
}

function getPlaidTransactionsDaysRequested(): number {
  const rawValue = process.env.PLAID_TRANSACTIONS_DAYS_REQUESTED?.trim();

  if (!rawValue) {
    return DEFAULT_PLAID_TRANSACTIONS_DAYS_REQUESTED;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 30) {
    return createPlaidConfigError("PLAID_TRANSACTIONS_DAYS_REQUESTED must be an integer of 30 or greater.");
  }

  return value;
}

function getPlaidAccessToken(query: BankTransactionQuery): string {
  const accessToken = query.plaidAccessToken?.trim();

  if (!accessToken) {
    throw new Error("Plaid access token is missing. Connect a bank account before reviewing transactions.");
  }

  return accessToken;
}

function getPlaidAccountId(query: BankTransactionQuery): string {
  const accountId = query.plaidAccountId?.trim();

  if (!accountId) {
    throw new Error("Plaid account id is missing. Choose a connected account before reviewing transactions.");
  }

  return accountId;
}

function getPlaidApiErrorDetails(error: unknown): {
  errorCode?: string;
  errorMessage?: string;
  errorType?: string;
  status?: number;
} {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown; status?: number } }).response;
    const data = response?.data;

    if (data && typeof data === "object") {
      const plaidError = data as {
        error_code?: string;
        error_message?: string;
        error_type?: string;
      };
      return {
        errorCode: plaidError.error_code,
        errorMessage: plaidError.error_message,
        errorType: plaidError.error_type,
        status: response?.status
      };
    }

    return {
      status: response?.status
    };
  }

  return {};
}

function getPlaidApiErrorMessage(error: unknown, fallback: string): string {
  const plaidError = getPlaidApiErrorDetails(error);

  if (plaidError.errorCode || plaidError.errorMessage || plaidError.errorType) {
    const details = [
      plaidError.errorType,
      plaidError.errorCode,
      plaidError.errorMessage
    ].filter(Boolean);

    if (details.length > 0) {
      return `Plaid API error: ${details.join(" - ")}`;
    }
  }

  if (plaidError.status) {
    return `Plaid API error (${plaidError.status}).`;
  }

  return fallback;
}

export function isPlaidDisconnectedItemErrorCode(errorCode: string | null | undefined): boolean {
  return Boolean(errorCode && PLAID_DISCONNECTED_ITEM_ERROR_CODES.has(errorCode));
}

function normalizeDescriptionPart(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueDescriptionParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const uniqueParts: string[] = [];

  parts.forEach((part) => {
    const value = part?.trim();

    if (!value) {
      return;
    }

    const normalizedValue = normalizeDescriptionPart(value);

    if (seen.has(normalizedValue)) {
      return;
    }

    seen.add(normalizedValue);
    uniqueParts.push(value);
  });

  return uniqueParts;
}

function descriptionStartsWithTitle(description: string, title: string): boolean {
  const normalizedDescription = normalizeDescriptionPart(description);
  const normalizedTitle = normalizeDescriptionPart(title);

  if (!normalizedDescription || !normalizedTitle) {
    return false;
  }

  if (!normalizedDescription.startsWith(normalizedTitle)) {
    return false;
  }

  const nextCharacter = normalizedDescription.charAt(normalizedTitle.length);

  return !nextCharacter || /\s|[^\w]/.test(nextCharacter);
}

function getPlaidAccountDisplayName(account: AccountBase, institutionName?: string | null): string {
  const accountName = account.official_name?.trim() || account.name.trim();

  return uniqueDescriptionParts([institutionName, accountName]).join(" ") || "Connected account";
}

function getSearchablePlaidDescription(transaction: PlaidTransactionLike, title: string): string {
  const rawDescription = transaction.original_description?.trim() || transaction.name.trim();

  if (rawDescription && descriptionStartsWithTitle(rawDescription, title)) {
    return rawDescription;
  }

  return uniqueDescriptionParts([title, rawDescription]).join(" ") || title;
}

export function mapPlaidTransactionToBankTransaction({
  accountName,
  connectionId,
  transaction
}: {
  accountName: string;
  connectionId: string;
  transaction: PlaidTransactionLike;
}): BankTransaction | null {
  if (transaction.pending) {
    return null;
  }

  const title = transaction.merchant_name?.trim() || transaction.name.trim() || "Plaid transaction";
  const memo = transaction.original_description?.trim() || transaction.name.trim() || title;

  return {
    id: transaction.transaction_id,
    connectionId,
    postedAt: transaction.date,
    title,
    memo,
    description: getSearchablePlaidDescription(transaction, title),
    amount: Math.abs(transaction.amount),
    direction: transaction.amount < 0 ? "credit" : "debit",
    accountId: transaction.account_id,
    accountName
  };
}

export async function createPlaidBankLinkToken(assetId: string): Promise<string> {
  const plaidClient = createPlaidClient();
  const request: LinkTokenCreateRequest = {
    client_name: "WealthVibe",
    country_codes: getPlaidCountryCodes(),
    language: "en",
    products: [Products.Transactions],
    redirect_uri: getPlaidRedirectUri(),
    transactions: {
      days_requested: getPlaidTransactionsDaysRequested()
    },
    user: {
      client_user_id: `wealthvibe-property-${assetId}`
    }
  };

  try {
    const response = await plaidClient.linkTokenCreate(request);

    return response.data.link_token;
  } catch (error) {
    throw new Error(getPlaidApiErrorMessage(error, "Could not create Plaid Link token."));
  }
}

export async function createPlaidBankUpdateLinkToken({
  accessToken,
  assetId
}: {
  accessToken: string;
  assetId: string;
}): Promise<string> {
  const token = accessToken.trim();

  if (!token) {
    throw new Error("Plaid access token is missing. Reconnect the bank account.");
  }

  const plaidClient = createPlaidClient();
  const request: LinkTokenCreateRequest = {
    access_token: token,
    client_name: "WealthVibe",
    country_codes: getPlaidCountryCodes(),
    language: "en",
    redirect_uri: getPlaidRedirectUri(),
    update: {
      reauthorization_enabled: true
    },
    user: {
      client_user_id: `wealthvibe-property-${assetId}`
    }
  };

  try {
    const response = await plaidClient.linkTokenCreate(request);

    return response.data.link_token;
  } catch (error) {
    throw new Error(getPlaidApiErrorMessage(error, "Could not create Plaid reconnect token."));
  }
}

export async function exchangePlaidPublicToken(publicToken: string): Promise<{
  accessToken: string;
  itemId: string;
}> {
  const token = publicToken.trim();

  if (!token) {
    throw new Error("Plaid public token is missing.");
  }

  try {
    const response = await createPlaidClient().itemPublicTokenExchange({
      public_token: token
    });

    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id
    };
  } catch (error) {
    throw new Error(getPlaidApiErrorMessage(error, "Could not exchange Plaid public token."));
  }
}

export async function removePlaidItem(accessToken: string): Promise<void> {
  const token = accessToken.trim();

  if (!token) {
    throw new Error("Plaid access token is missing. Could not remove Plaid Item.");
  }

  try {
    await createPlaidClient().itemRemove({
      access_token: token
    });
  } catch (error) {
    throw new Error(getPlaidApiErrorMessage(error, "Could not remove Plaid Item."));
  }
}

export async function getPlaidItemHealth(accessToken: string): Promise<PlaidItemHealth> {
  const token = accessToken.trim();

  if (!token) {
    throw new Error("Plaid access token is missing. Could not check Plaid Item.");
  }

  try {
    const response = await createPlaidClient().itemGet({
      access_token: token
    });
    const itemError = response.data.item.error;
    const errorCode = itemError?.error_code ?? null;
    const errorMessage = itemError?.error_message ?? null;

    return {
      errorCode,
      errorMessage,
      status: isPlaidDisconnectedItemErrorCode(errorCode) ? "disconnected" : "active"
    };
  } catch (error) {
    const details = getPlaidApiErrorDetails(error);

    if (isPlaidDisconnectedItemErrorCode(details.errorCode)) {
      return {
        errorCode: details.errorCode ?? null,
        errorMessage: details.errorMessage ?? null,
        status: "disconnected"
      };
    }

    throw new Error(getPlaidApiErrorMessage(error, "Could not check Plaid Item."));
  }
}

export async function getPlaidConnectionAccounts({
  accessToken,
  itemId,
  selectedAccountIds
}: {
  accessToken: string;
  itemId: string;
  selectedAccountIds?: string[];
}): Promise<PlaidConnectionAccount[]> {
  const selectedIds = new Set((selectedAccountIds ?? []).map((id) => id.trim()).filter(Boolean));

  try {
    const response = await createPlaidClient().accountsGet({
      access_token: accessToken
    });

    return mapPlaidConnectionAccounts({
      accounts: response.data.accounts,
      item: {
        institution_id: response.data.item.institution_id,
        institution_name: response.data.item.institution_name,
        item_id: response.data.item.item_id || itemId
      },
      selectedAccountIds: Array.from(selectedIds)
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No Plaid accounts")) {
      throw error;
    }

    throw new Error(getPlaidApiErrorMessage(error, "Could not load Plaid accounts."));
  }
}

export function mapPlaidConnectionAccounts({
  accounts,
  item,
  selectedAccountIds
}: {
  accounts: PlaidConnectionAccountLike[];
  item: PlaidConnectionItemLike;
  selectedAccountIds?: string[];
}): PlaidConnectionAccount[] {
  const selectedIds = new Set((selectedAccountIds ?? []).map((id) => id.trim()).filter(Boolean));
  const selectedAccounts = accounts.filter(
    (account) => selectedIds.size === 0 || selectedIds.has(account.account_id)
  );

  if (selectedAccounts.length === 0) {
    throw new Error("No Plaid accounts with transaction access were selected.");
  }

  return selectedAccounts.map((account) => ({
    accountId: account.account_id,
    accountName: getPlaidAccountDisplayName(account as AccountBase, item.institution_name),
    accountType: account.type || null,
    accountSubtype: account.subtype || null,
    institutionId: item.institution_id || null,
    institutionName: item.institution_name || null,
    lastFour: account.mask || null,
    providerItemId: item.item_id
  }));
}

async function fetchPlaidBankTransactions(
  query: BankTransactionQuery
): Promise<BankTransactionProviderResult> {
  const plaidClient = createPlaidClient();
  const accessToken = getPlaidAccessToken(query);
  const accountId = getPlaidAccountId(query);
  const transactions: Transaction[] = [];
  let accountName = query.plaidAccountName?.trim() || "";
  let totalTransactions = 0;
  let offset = 0;

  try {
    do {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        end_date: query.endDate,
        options: {
          account_ids: [accountId],
          count: PLAID_TRANSACTION_PAGE_SIZE,
          include_original_description: true,
          offset
        },
        start_date: query.startDate
      });

      if (!accountName) {
        const account = response.data.accounts.find((item) => item.account_id === accountId);
        accountName = account
          ? getPlaidAccountDisplayName(account, response.data.item.institution_name)
          : "Connected Plaid account";
      }

      transactions.push(...response.data.transactions);
      totalTransactions = response.data.total_transactions;
      offset += response.data.transactions.length;
    } while (offset < totalTransactions && totalTransactions > 0);
  } catch (error) {
    const details = getPlaidApiErrorDetails(error);

    if (isPlaidDisconnectedItemErrorCode(details.errorCode)) {
      throw new PlaidItemDisconnectedError(
        details.errorCode ?? "ITEM_LOGIN_REQUIRED",
        getPlaidApiErrorMessage(error, "Plaid Item requires reconnect.")
      );
    }

    throw new Error(getPlaidApiErrorMessage(error, "Could not fetch Plaid transactions."));
  }

  return {
    provider: "plaid",
    transactions: transactions.flatMap((transaction) => {
      const mappedTransaction = mapPlaidTransactionToBankTransaction({
        accountName: accountName || "Connected Plaid account",
        connectionId: query.bankConnectionId?.trim() || accountId,
        transaction
      });

      return mappedTransaction ? [mappedTransaction] : [];
    })
  };
}

function getMonthPrefix(date: string): string {
  return date.slice(0, 7);
}

function getMockPostedAt(query: BankTransactionQuery, day: number): string {
  return `${getMonthPrefix(query.startDate)}-${String(day).padStart(2, "0")}`;
}

function getMockRentAmount(query: BankTransactionQuery): number {
  return query.expectedRentAmount && query.expectedRentAmount > 0
    ? query.expectedRentAmount
    : 2500;
}

async function fetchMockBankTransactions(
  query: BankTransactionQuery
): Promise<BankTransactionProviderResult> {
  const rentAmount = getMockRentAmount(query);

  return {
    provider: "mock",
    transactions: [
      {
        id: "mock-rent-deposit",
        connectionId: "mock",
        postedAt: getMockPostedAt(query, 3),
        title: "Tenant rent",
        memo: "Tenant rent payment",
        description: "Tenant rent payment",
        amount: rentAmount,
        direction: "credit",
        accountId: "mock-operating-checking",
        accountName: "Operating Checking"
      },
      {
        id: "mock-partial-rent",
        connectionId: "mock",
        postedAt: getMockPostedAt(query, 10),
        title: "Tenant partial rent",
        memo: "Tenant partial payment",
        description: "Tenant partial payment",
        amount: Math.round(rentAmount / 2),
        direction: "credit",
        accountId: "mock-operating-checking",
        accountName: "Operating Checking"
      },
      {
        id: "mock-security-deposit",
        connectionId: "mock",
        postedAt: getMockPostedAt(query, 12),
        title: "Security deposit",
        memo: "Security deposit",
        description: "Security deposit",
        amount: rentAmount,
        direction: "credit",
        accountId: "mock-operating-checking",
        accountName: "Operating Checking"
      },
      {
        id: "mock-repair-expense",
        connectionId: "mock",
        postedAt: getMockPostedAt(query, 18),
        title: "Plumbing repair",
        memo: "Plumbing repair",
        description: "Plumbing repair",
        amount: 180,
        direction: "debit",
        accountId: "mock-operating-checking",
        accountName: "Operating Checking"
      }
    ]
  };
}

export async function fetchBankTransactions(
  query: BankTransactionQuery
): Promise<BankTransactionProviderResult> {
  const provider = (query.bankProvider ?? getConfiguredBankTransactionProvider()) as
    | string
    | null;

  if (provider === "plaid") {
    return fetchPlaidBankTransactions(query);
  }

  if (provider === "mock") {
    if (isProductionRuntime()) {
      return createMockBankProviderError();
    }

    return fetchMockBankTransactions(query);
  }

  return createMissingBankProviderError();
}
