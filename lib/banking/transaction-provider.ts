import { readFile } from "fs/promises";
import { request as httpsRequest } from "https";

export type BankTransactionProviderName = "mock" | "teller";
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
  tellerAccessToken?: string | null;
  tellerAccountId?: string | null;
  tellerAccountName?: string | null;
  bankConnectionId?: string | null;
  bankProvider?: BankTransactionProviderName | null;
}

export interface BankTransactionProviderResult {
  provider: BankTransactionProviderName;
  transactions: BankTransaction[];
}

function getConfiguredBankTransactionProvider(): BankTransactionProviderName {
  const provider = process.env.BANK_TRANSACTION_PROVIDER?.trim().toLowerCase();

  if (provider === "teller") {
    return "teller";
  }

  if (provider === "mock") {
    return "mock";
  }

  return "mock";
}

interface TellerAccount {
  id: string;
  enrollment_id: string;
  name: string;
  currency?: string;
  last_four?: string | null;
  status: string;
  type: string;
  subtype: string;
  links?: {
    transactions?: string;
  };
  institution?: {
    id?: string;
    name?: string;
  };
}

interface TellerTransaction {
  id: string;
  account_id: string;
  amount: string;
  date: string;
  description: string;
  status: string;
  details?: {
    category?: string | null;
    counterparty?: {
      name?: string | null;
    };
  };
}

interface TellerRequestConfig {
  accessToken: string;
  certPath?: string;
  privateKeyPath?: string;
}

function getTellerAccessToken(query: BankTransactionQuery): string {
  const accessToken = query.tellerAccessToken?.trim() || process.env.TELLER_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new Error(
      "Teller access token is missing. Connect a bank account or set TELLER_ACCESS_TOKEN for local testing."
    );
  }

  return accessToken;
}

function getTellerAccountId(query: BankTransactionQuery): string | null {
  return query.tellerAccountId?.trim() || process.env.TELLER_ACCOUNT_ID?.trim() || null;
}

function getTellerApiBaseUrl(): string {
  return process.env.TELLER_API_BASE_URL?.trim() || "https://api.teller.io";
}

function getTellerAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
    Accept: "application/json"
  };
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

function getTellerTitle(transaction: TellerTransaction): string {
  const counterparty = transaction.details?.counterparty?.name?.trim();

  return counterparty || transaction.description;
}

function getSearchableTellerDescription(transaction: TellerTransaction): string {
  const title = getTellerTitle(transaction);
  const description = transaction.description.trim();

  if (description && descriptionStartsWithTitle(description, title)) {
    return description;
  }

  return uniqueDescriptionParts([title, description]).join(" ");
}

function getTellerDirection(transaction: TellerTransaction, amount: number): BankTransactionDirection {
  if (transaction.details?.category === "income") {
    return "credit";
  }

  return amount >= 0 ? "credit" : "debit";
}

async function tellerFetchWithMtls<T>(
  url: URL,
  config: Required<TellerRequestConfig>
): Promise<T> {
  const [cert, key] = await Promise.all([
    readFile(config.certPath),
    readFile(config.privateKeyPath)
  ]);

  return new Promise<T>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        cert,
        key,
        headers: getTellerAuthHeaders(config.accessToken)
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Teller API error (${response.statusCode ?? "unknown"}): ${body}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error("Teller API returned invalid JSON."));
          }
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

async function tellerFetch<T>(path: string, config: TellerRequestConfig): Promise<T> {
  const url = new URL(path, getTellerApiBaseUrl());
  const hasCertificate = Boolean(config.certPath && config.privateKeyPath);

  if (hasCertificate) {
    return tellerFetchWithMtls(url, {
      accessToken: config.accessToken,
      certPath: config.certPath as string,
      privateKeyPath: config.privateKeyPath as string
    });
  }

  const response = await fetch(url, {
    headers: getTellerAuthHeaders(config.accessToken),
    cache: "no-store"
  });
  const body = await response.text();

  if (!response.ok) {
    const certHint =
      response.status === 401
        ? " If this is development or production Teller data, set TELLER_CERT_PATH and TELLER_PRIVATE_KEY_PATH."
        : "";

    throw new Error(`Teller API error (${response.status}): ${body}${certHint}`);
  }

  return JSON.parse(body) as T;
}

async function fetchTellerAccounts(config: TellerRequestConfig): Promise<TellerAccount[]> {
  return tellerFetch<TellerAccount[]>("/accounts", config);
}

function getSupportedTellerAccounts(
  accounts: TellerAccount[],
  accountId: string | null
): TellerAccount[] {
  const openAccounts = accounts.filter(
    (account) =>
      account.status === "open" &&
      Boolean(account.links?.transactions) &&
      (!accountId || account.id === accountId)
  );

  if (accountId && openAccounts.length === 0) {
    throw new Error("Selected Teller account was not found or does not support transactions.");
  }

  return openAccounts;
}

function buildTellerTransactionPath(
  accountId: string,
  query: BankTransactionQuery
): string {
  const params = new URLSearchParams({
    start_date: query.startDate,
    end_date: query.endDate
  });

  return `/accounts/${accountId}/transactions?${params.toString()}`;
}

async function fetchTellerBankTransactions(
  query: BankTransactionQuery
): Promise<BankTransactionProviderResult> {
  const config = {
    accessToken: getTellerAccessToken(query),
    certPath: process.env.TELLER_CERT_PATH?.trim(),
    privateKeyPath: process.env.TELLER_PRIVATE_KEY_PATH?.trim()
  };
  const accounts = getSupportedTellerAccounts(
    await fetchTellerAccounts(config),
    getTellerAccountId(query)
  );
  const transactionGroups = await Promise.all(
    accounts.map(async (account) => {
      const transactions = await tellerFetch<TellerTransaction[]>(
        buildTellerTransactionPath(account.id, query),
        config
      );

      return transactions.map((transaction) => {
        const signedAmount = Number(transaction.amount);
        const direction = getTellerDirection(transaction, signedAmount);

        return {
          id: transaction.id,
          connectionId: query.bankConnectionId?.trim() || account.id,
          postedAt: transaction.date,
          title: getTellerTitle(transaction),
          memo: transaction.description,
          description: getSearchableTellerDescription(transaction),
          amount: Math.abs(signedAmount),
          direction,
          accountId: account.id,
          accountName:
            query.tellerAccountName?.trim() ||
            `${account.institution?.name ?? "Teller"} ${account.name}`.trim()
        };
      });
    })
  );

  return {
    provider: "teller",
    transactions: transactionGroups.flat()
  };
}

export async function getTellerConnectionAccount(accessToken: string): Promise<{
  accountId: string;
  accountName: string;
}> {
  const accounts = await getTellerConnectionAccounts(accessToken);
  const account =
    accounts.find((item) => item.accountType === "depository" && item.accountSubtype === "checking") ??
    accounts.find((item) => item.accountType === "depository") ??
    accounts[0];

  if (!account) {
    throw new Error("No Teller account with transaction access was found.");
  }

  return {
    accountId: account.accountId,
    accountName: account.accountName
  };
}

export async function getTellerConnectionAccounts(accessToken: string): Promise<
  Array<{
    accountId: string;
    accountName: string;
    accountType: string | null;
    accountSubtype: string | null;
    enrollmentId: string | null;
    institutionId: string | null;
    institutionName: string | null;
    lastFour: string | null;
  }>
> {
  const accounts = getSupportedTellerAccounts(
    await fetchTellerAccounts({
      accessToken,
      certPath: process.env.TELLER_CERT_PATH?.trim(),
      privateKeyPath: process.env.TELLER_PRIVATE_KEY_PATH?.trim()
    }),
    null
  );

  if (accounts.length === 0) {
    throw new Error("No Teller account with transaction access was found.");
  }

  return accounts.map((account) => ({
    accountId: account.id,
    accountName: `${account.institution?.name ?? "Teller"} ${account.name}`.trim(),
    accountType: account.type || null,
    accountSubtype: account.subtype || null,
    enrollmentId: account.enrollment_id || null,
    institutionId: account.institution?.id || null,
    institutionName: account.institution?.name || null,
    lastFour: account.last_four || null
  }));
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
  const provider = query.bankProvider ?? getConfiguredBankTransactionProvider();

  if (provider === "teller") {
    return fetchTellerBankTransactions(query);
  }

  if (provider === "mock") {
    return fetchMockBankTransactions(query);
  }

  return fetchMockBankTransactions(query);
}
