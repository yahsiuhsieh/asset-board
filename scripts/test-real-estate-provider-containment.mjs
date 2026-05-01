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
