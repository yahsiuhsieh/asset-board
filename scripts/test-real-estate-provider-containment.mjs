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

test("linkable Plaid bank connections reuse existing items without exposing tokens", async () => {
  const module = await loadTsModule("../lib/real-estate-bank-connections.ts");
  const baseConnection = {
    provider: "plaid",
    access_token: "access-item-1",
    account_id: "checking",
    account_name: "Primary Checking",
    account_type: "depository",
    account_subtype: "checking",
    institution_name: "Chase",
    institution_id: "ins_56",
    last_four: "1234",
    provider_item_id: "item-1",
    status: "active"
  };
  const options = module.exports.getLinkablePlaidBankConnectionOptions({
    targetAssetId: "property-3",
    connections: [
      {
        ...baseConnection,
        id: "source-a",
        asset_id: "property-1"
      },
      {
        ...baseConnection,
        id: "source-b",
        asset_id: "property-2"
      },
      {
        ...baseConnection,
        id: "disconnected-source",
        asset_id: "property-4",
        account_id: "savings",
        status: "disconnected"
      }
    ]
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].sourceConnectionId, "source-a");
  assert.equal(options[0].accountName, "Primary Checking");
  assert.equal(options[0].linkedPropertyCount, 2);
  assert.equal(Object.hasOwn(options[0], "access_token"), false);
});

test("linkable Plaid bank connections exclude accounts already linked to target property", async () => {
  const module = await loadTsModule("../lib/real-estate-bank-connections.ts");
  const options = module.exports.getLinkablePlaidBankConnectionOptions({
    targetAssetId: "property-2",
    connections: [
      {
        id: "source",
        asset_id: "property-1",
        provider: "plaid",
        access_token: "access-item-1",
        account_id: "checking",
        account_name: "Primary Checking",
        account_type: "depository",
        account_subtype: "checking",
        institution_name: "Chase",
        institution_id: "ins_56",
        last_four: "1234",
        provider_item_id: "item-1",
        status: "active"
      },
      {
        id: "target",
        asset_id: "property-2",
        provider: "plaid",
        access_token: "access-item-1",
        account_id: "checking",
        account_name: "Primary Checking",
        account_type: "depository",
        account_subtype: "checking",
        institution_name: "Chase",
        institution_id: "ins_56",
        last_four: "1234",
        provider_item_id: "item-1",
        status: "active"
      }
    ]
  });

  assert.equal(options.length, 0);
});

test("recent Plaid raw sync requires active status, coverage, and cooldown", async () => {
  const module = await loadTsModule("../lib/real-estate-bank-connections.ts");
  const now = new Date("2026-05-10T12:00:00.000Z");
  const baseConnection = {
    access_token: "access-token",
    account_id: "checking",
    last_synced_at: "2026-05-10T11:57:00.000Z",
    provider_item_id: "item-id",
    raw_transactions_synced_end_date: "2026-05-10",
    raw_transactions_synced_start_date: "2026-03-11",
    status: "active"
  };
  const isRecent = (overrides = {}) =>
    module.exports.hasRecentPlaidAccountRawSync({
      connection: {
        ...baseConnection,
        ...overrides
      },
      cooldownMs: 5 * 60 * 1000,
      endDate: "2026-05-10",
      now,
      startDate: "2026-03-11"
    });

  assert.equal(isRecent(), true);
  assert.equal(
    isRecent({
      last_synced_at: "2026-05-10T11:54:59.000Z"
    }),
    false
  );
  assert.equal(
    isRecent({
      raw_transactions_synced_start_date: "2026-03-12"
    }),
    false
  );
  assert.equal(
    isRecent({
      status: "disconnected"
    }),
    false
  );
});

test("unique Plaid account connections dedupe only the same item account pair", async () => {
  const module = await loadTsModule("../lib/real-estate-bank-connections.ts");
  const connections = [
    {
      access_token: "access-token",
      account_id: "checking",
      provider_item_id: "item-id"
    },
    {
      access_token: "access-token",
      account_id: "checking",
      provider_item_id: "item-id"
    },
    {
      access_token: "access-token",
      account_id: "savings",
      provider_item_id: "item-id"
    }
  ];

  const uniqueConnections = module.exports.getUniquePlaidAccountConnections(connections);

  assert.equal(uniqueConnections.length, 2);
  assert.equal(
    JSON.stringify(uniqueConnections.map(module.exports.getPlaidAccountConnectionKey)),
    JSON.stringify(["item-id:checking", "item-id:savings"])
  );
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
