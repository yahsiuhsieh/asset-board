import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadQualityHelpers() {
  const source = await readFile(
    new URL("../lib/real-estate-annual-quality.ts", import.meta.url),
    "utf8"
  );
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
      module
    },
    {
      filename: "real-estate-annual-quality.ts"
    }
  );

  return module.exports;
}

const helpers = await loadQualityHelpers();
const today = new Date("2026-04-30T12:00:00.000Z");

function transaction(overrides) {
  return {
    id: "transaction-id",
    assetId: "property-1",
    bankConnectionId: null,
    provider: "teller",
    providerTransactionId: "provider-transaction-id",
    accountId: "account-id",
    accountName: "Operating Checking",
    postedAt: "2026-01-01",
    description: "Transaction",
    memo: null,
    amount: 100,
    direction: "credit",
    classification: "rental_income",
    category: null,
    note: null,
    ...overrides
  };
}

function property(overrides) {
  return {
    id: "property-1",
    name: "Duplex A",
    address: "100 Main St",
    rentalStatus: "rented",
    purchasedAt: "2025-01-01",
    monthlyRent: 1800,
    propertyTransactions: [],
    ...overrides
  };
}

function issueCodes(result, severity) {
  const issues =
    severity === "blocking" ? result.blockingIssues : result.warningIssues;

  return Array.from(issues, (issue) => issue.code);
}

test("rented property with missing rent months has a blocking issue", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      propertyTransactions: [
        transaction({ postedAt: "2026-01-05", classification: "rental_income" })
      ]
    }),
    "2026",
    today
  );

  assert.deepEqual(issueCodes(result, "blocking"), ["missing_rent_months"]);
  assert.deepEqual(Array.from(result.blockingIssues[0].months), [
    "2026-02",
    "2026-03",
    "2026-04"
  ]);
});

test("vacant property skips missing rent blockers", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      rentalStatus: "vacant",
      propertyTransactions: []
    }),
    "2026",
    today
  );

  assert.equal(result.blockingIssues.length, 0);
  assert.ok(issueCodes(result, "warning").includes("vacant_rent_check_skipped"));
});

test("vacant property still blocks missing expense categories", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      rentalStatus: "vacant",
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-10",
          classification: "expense",
          direction: "debit",
          category: null
        })
      ]
    }),
    "2026",
    today
  );

  assert.deepEqual(issueCodes(result, "blocking"), ["missing_expense_category"]);
});

test("unclassified expense transactions are blocking issues", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyRent: 0,
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-10",
          classification: null,
          direction: "debit",
          category: null
        })
      ]
    }),
    "2026",
    today
  );

  assert.deepEqual(issueCodes(result, "blocking"), [
    "unclassified_expense_transactions"
  ]);
  assert.ok(!issueCodes(result, "warning").includes("no_expenses_recorded"));
});

test("ignored and no-expense checks are warnings only", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      propertyTransactions: [
        transaction({
          postedAt: "2026-01-10",
          classification: "ignored",
          direction: "debit"
        }),
        transaction({ postedAt: "2026-01-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-02-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-03-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-04-05", classification: "rental_income" })
      ]
    }),
    "2026",
    today
  );

  assert.equal(result.blockingIssues.length, 0);
  assert.deepEqual(issueCodes(result, "warning"), [
    "ignored_transactions",
    "no_expenses_recorded"
  ]);
});

test("future months are not checked", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      propertyTransactions: [
        transaction({ postedAt: "2026-01-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-02-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-03-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-04-05", classification: "rental_income" })
      ]
    }),
    "2026",
    today
  );

  assert.ok(!issueCodes(result, "blocking").includes("missing_rent_months"));
});

test("purchase date skips months before purchase", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      purchasedAt: "2026-03-15",
      propertyTransactions: [
        transaction({ postedAt: "2026-03-20", classification: "rental_income" })
      ]
    }),
    "2026",
    today
  );

  assert.deepEqual(Array.from(result.blockingIssues[0].months), ["2026-04"]);
});

test("portfolio gate detects blocking issues", () => {
  const results = helpers.getPortfolioAnnualQualityResults(
    [
      property({
        propertyTransactions: []
      }),
      property({
        id: "property-2",
        name: "Condo B",
        rentalStatus: "vacant",
        propertyTransactions: []
      })
    ],
    "2026",
    today
  );

  assert.equal(helpers.hasBlockingAnnualQualityIssues(results), true);
  assert.equal(helpers.getBlockingAnnualQualityIssues(results).length, 1);
});
