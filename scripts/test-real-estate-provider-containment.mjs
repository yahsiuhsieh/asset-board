import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

async function loadTsModule(pathname) {
  const source = await readFile(new URL(pathname, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  const env = { ...process.env };

  vm.runInNewContext(
    outputText,
    {
      AbortSignal,
      Buffer,
      Date,
      URL,
      URLSearchParams,
      console,
      exports: module.exports,
      fetch,
      module,
      process: { env },
      require
    },
    {
      filename: pathname
    }
  );

  return {
    env,
    exports: module.exports
  };
}

function bankQuery(overrides = {}) {
  return {
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    ...overrides
  };
}

function valuationInput(overrides = {}) {
  return {
    assetId: "property-1",
    address: "100 Main St, Austin, TX",
    purchasePrice: 500000,
    currentMarketValue: 525000,
    ...overrides
  };
}

test("bank transaction provider does not fallback to mock when unset", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");

  delete module.env.BANK_TRANSACTION_PROVIDER;
  module.env.NODE_ENV = "test";

  assert.equal(module.exports.getConfiguredBankTransactionProvider(), null);
  await assert.rejects(
    () => module.exports.fetchBankTransactions(bankQuery()),
    /Bank transaction provider is not configured/
  );
});

test("bank transaction provider rejects mock in production", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");

  module.env.BANK_TRANSACTION_PROVIDER = "mock";
  module.env.NODE_ENV = "production";

  assert.throws(
    () => module.exports.getConfiguredBankTransactionProvider(),
    /Mock bank transactions are disabled in production/
  );
  await assert.rejects(
    () => module.exports.fetchBankTransactions(bankQuery({ bankProvider: "mock" })),
    /Mock bank transactions are disabled in production/
  );
});

test("bank transaction provider allows explicit mock outside production", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");

  module.env.BANK_TRANSACTION_PROVIDER = "mock";
  module.env.NODE_ENV = "test";

  const result = await module.exports.fetchBankTransactions(
    bankQuery({ expectedRentAmount: 3200 })
  );

  assert.equal(result.provider, "mock");
  assert.ok(result.transactions.some((transaction) => transaction.amount === 3200));
});

test("bank transaction provider rejects Plaid when credentials are missing", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");

  module.env.BANK_TRANSACTION_PROVIDER = "plaid";
  module.env.NODE_ENV = "test";
  delete module.env.PLAID_CLIENT_ID;
  delete module.env.PLAID_SECRET;

  assert.equal(module.exports.getConfiguredBankTransactionProvider(), "plaid");
  await assert.rejects(
    () =>
      module.exports.fetchBankTransactions(
        bankQuery({
          bankProvider: "plaid",
          plaidAccessToken: "access-sandbox",
          plaidAccountId: "account-id"
        })
      ),
    /Plaid is not configured.*PLAID_CLIENT_ID/
  );
});

test("Plaid reconnect and item removal require an access token before API calls", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");

  module.env.NODE_ENV = "test";
  delete module.env.PLAID_CLIENT_ID;
  delete module.env.PLAID_SECRET;

  await assert.rejects(
    () =>
      module.exports.createPlaidBankUpdateLinkToken({
        accessToken: "",
        assetId: "property-1"
      }),
    /Plaid access token is missing/
  );
  await assert.rejects(
    () => module.exports.removePlaidItem(""),
    /Plaid access token is missing/
  );
  await assert.rejects(
    () => module.exports.getPlaidItemHealth(""),
    /Plaid access token is missing/
  );
});

test("Plaid item health classifies reconnect-required error codes", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");

  assert.equal(module.exports.isPlaidDisconnectedItemErrorCode("ITEM_LOGIN_REQUIRED"), true);
  assert.equal(module.exports.isPlaidDisconnectedItemErrorCode("USER_PERMISSION_REVOKED"), true);
  assert.equal(module.exports.isPlaidDisconnectedItemErrorCode("PRODUCT_NOT_READY"), false);
});

test("bank transaction provider does not accept retired provider names", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");
  const retiredProvider = ["tel", "ler"].join("");

  module.env.BANK_TRANSACTION_PROVIDER = retiredProvider;
  module.env.NODE_ENV = "test";

  assert.equal(module.exports.getConfiguredBankTransactionProvider(), null);
  await assert.rejects(
    () => module.exports.fetchBankTransactions(bankQuery({ bankProvider: retiredProvider })),
    /Bank transaction provider is not configured/
  );
});

test("Plaid transaction mapper converts signed amounts and skips pending rows", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");
  const baseTransaction = {
    account_id: "account-id",
    date: "2026-02-05",
    merchant_name: "Tenant ACH",
    name: "TENANT ACH CREDIT",
    original_description: "TENANT ACH CREDIT",
    pending: false,
    transaction_id: "transaction-id"
  };

  const debit = module.exports.mapPlaidTransactionToBankTransaction({
    accountName: "Operating Checking",
    connectionId: "connection-id",
    transaction: {
      ...baseTransaction,
      amount: 180,
      merchant_name: "Plumbing Repair",
      name: "PLUMBING REPAIR",
      transaction_id: "debit-id"
    }
  });
  const credit = module.exports.mapPlaidTransactionToBankTransaction({
    accountName: "Operating Checking",
    connectionId: "connection-id",
    transaction: {
      ...baseTransaction,
      amount: -3200,
      transaction_id: "credit-id"
    }
  });
  const pending = module.exports.mapPlaidTransactionToBankTransaction({
    accountName: "Operating Checking",
    connectionId: "connection-id",
    transaction: {
      ...baseTransaction,
      amount: 25,
      pending: true,
      transaction_id: "pending-id"
    }
  });

  assert.equal(debit.direction, "debit");
  assert.equal(debit.amount, 180);
  assert.equal(credit.direction, "credit");
  assert.equal(credit.amount, 3200);
  assert.equal(pending, null);
});

test("Plaid account mapper keeps only selected accounts", async () => {
  const module = await loadTsModule("../lib/banking/transaction-provider.ts");
  const accounts = module.exports.mapPlaidConnectionAccounts({
    accounts: [
      {
        account_id: "checking",
        mask: "1234",
        name: "Checking",
        official_name: "Primary Checking",
        subtype: "checking",
        type: "depository"
      },
      {
        account_id: "savings",
        mask: "5678",
        name: "Savings",
        official_name: "Savings",
        subtype: "savings",
        type: "depository"
      }
    ],
    item: {
      institution_id: "ins_1",
      institution_name: "Plaid Bank",
      item_id: "item-id"
    },
    selectedAccountIds: ["checking"]
  });

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].accountId, "checking");
  assert.equal(accounts[0].providerItemId, "item-id");
  assert.equal(accounts[0].institutionName, "Plaid Bank");
});

test("real estate transaction fingerprint catches Plaid reconnect duplicates", async () => {
  const module = await loadTsModule("../lib/real-estate-transaction-dedupe.ts");
  const originalTransaction = {
    accountName: "Plaid Bank Primary Checking",
    amount: 180,
    description: "PLUMBING REPAIR",
    direction: "debit",
    memo: "Plumbing repair",
    postedAt: "2026-02-05"
  };
  const reconnectedTransaction = {
    ...originalTransaction
  };
  const differentTransaction = {
    ...originalTransaction,
    amount: 181
  };

  assert.equal(
    module.exports.isSameRealEstateTransactionFingerprint(
      originalTransaction,
      reconnectedTransaction
    ),
    true
  );
  assert.equal(
    module.exports.isSameRealEstateTransactionFingerprint(
      originalTransaction,
      differentTransaction
    ),
    false
  );
});

test("property valuation provider does not fallback to mock when unset", async () => {
  const module = await loadTsModule("../lib/valuations/property-valuation-provider.ts");

  delete module.env.PROPERTY_VALUATION_PROVIDER;
  module.env.NODE_ENV = "test";

  assert.equal(module.exports.getConfiguredPropertyValuationProvider(), null);
  await assert.rejects(
    () => module.exports.fetchPropertyValuation(valuationInput()),
    /Property valuation provider is not configured/
  );
});

test("property valuation provider rejects mock in production", async () => {
  const module = await loadTsModule("../lib/valuations/property-valuation-provider.ts");

  module.env.PROPERTY_VALUATION_PROVIDER = "mock";
  module.env.NODE_ENV = "production";

  assert.throws(
    () => module.exports.getConfiguredPropertyValuationProvider(),
    /Mock property valuation is disabled in production/
  );
});

test("property valuation provider allows explicit mock outside production", async () => {
  const module = await loadTsModule("../lib/valuations/property-valuation-provider.ts");

  module.env.PROPERTY_VALUATION_PROVIDER = "mock";
  module.env.NODE_ENV = "test";

  const result = await module.exports.fetchPropertyValuation(valuationInput());

  assert.equal(result.source, "mock");
  assert.ok(result.value > 0);
});
