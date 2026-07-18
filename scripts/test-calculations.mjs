import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadTsModule(path, requireMap = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      exports: module.exports,
      module,
      require: (id) => {
        if (id in requireMap) {
          return requireMap[id];
        }

        throw new Error(`Unexpected import in test module: ${id}`);
      }
    },
    {
      filename: path
    }
  );

  return module.exports;
}

const expenseHelpers = await loadTsModule("../lib/real-estate-expenses.ts");
const helpers = await loadTsModule("../lib/calculations.ts", {
  "@/lib/real-estate-expenses": expenseHelpers
});
const today = new Date("2026-04-30T12:00:00.000Z");

function transaction(overrides) {
  return {
    id: "transaction-id",
    assetId: "property-1",
    rawBankTransactionId: null,
    bankConnectionId: null,
    provider: "plaid",
    providerTransactionId: "provider-transaction-id",
    accountId: "account-id",
    accountName: "Operating Checking",
    postedAt: "2026-01-01",
    description: "Transaction",
    originalDescription: null,
    memo: null,
    amount: 100,
    direction: "credit",
    classification: "rental_income",
    category: null,
    rentPeriodMonth: null,
    note: null,
    ...overrides
  };
}

function property(overrides = {}) {
  return {
    id: "property-1",
    type: "real-estate",
    value: 500000,
    purchasePrice: 450000,
    cashInvested: 100000,
    currentMarketValue: 550000,
    remainingMortgageBalance: 350000,
    monthlyRent: 2500,
    monthlyMortgage: 1200,
    purchasedAt: "2026-01-15",
    propertyTransactions: [],
    ...overrides
  };
}

test("calculates annual cash-on-cash return from cash invested", () => {
  const result = helpers.calculateCashOnCashReturn(
    property({
      cashInvested: 120000,
      monthlyRent: 3000,
      monthlyMortgage: 1500
    })
  );

  assert.equal(result, (3000 * 12 - 1500 * 12) / 120000);
});

test("cash-on-cash return is unavailable without cash invested", () => {
  assert.equal(helpers.calculateCashOnCashReturn(property({ cashInvested: 0 })), null);
});

test("calculates cumulative cash flow after debt service since purchase", () => {
  const result = helpers.getCumulativeCashFlowAfterDebtService(
    property({
      monthlyMortgage: 1000,
      purchasedAt: "2026-02-15",
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-10",
          amount: 999,
          classification: "rental_income"
        }),
        transaction({
          postedAt: "2026-02-20",
          amount: 2000,
          classification: "rental_income"
        }),
        transaction({
          postedAt: "2026-03-05",
          amount: 2000,
          classification: "rental_income"
        }),
        transaction({
          postedAt: "2026-03-15",
          amount: 400,
          direction: "debit",
          classification: "expense",
          category: "maintenance"
        }),
        transaction({
          postedAt: "2026-04-01",
          amount: 300,
          direction: "debit",
          classification: "ignored"
        })
      ]
    }),
    today
  );

  assert.equal(result, 2000 + 2000 - 400 - 3000);
});

test("calculates total return since purchase from equity and cash flow", () => {
  const targetProperty = property({
    cashInvested: 100000,
    currentMarketValue: 550000,
    remainingMortgageBalance: 350000,
    monthlyMortgage: 1000,
    purchasedAt: "2026-02-15",
    propertyTransactions: [
      transaction({
        postedAt: "2026-02-20",
        amount: 2000,
        classification: "rental_income"
      }),
      transaction({
        postedAt: "2026-03-15",
        amount: 500,
        direction: "debit",
        classification: "expense",
        category: "maintenance"
      })
    ]
  });

  assert.equal(
    helpers.calculateTotalReturnSincePurchaseAmount(targetProperty, today),
    200000 + (2000 - 500 - 3000) - 100000
  );
  assert.equal(
    helpers.calculateTotalReturnSincePurchase(targetProperty, today),
    (200000 + (2000 - 500 - 3000) - 100000) / 100000
  );
});

test("total return since purchase is unavailable without purchase date", () => {
  const targetProperty = property({ purchasedAt: null });

  assert.equal(
    helpers.getCumulativeCashFlowAfterDebtService(targetProperty, today),
    null
  );
  assert.equal(
    helpers.calculateTotalReturnSincePurchaseAmount(targetProperty, today),
    null
  );
  assert.equal(helpers.calculateTotalReturnSincePurchase(targetProperty, today), null);
});
