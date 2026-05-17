import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadQualityHelpers() {
  const monthlyReviewSource = await readFile(
    new URL("../lib/real-estate-monthly-review.ts", import.meta.url),
    "utf8"
  );
  const { outputText: monthlyReviewOutput } = ts.transpileModule(monthlyReviewSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const monthlyReviewModule = { exports: {} };

  vm.runInNewContext(
    monthlyReviewOutput,
    {
      exports: monthlyReviewModule.exports,
      module: monthlyReviewModule
    },
    {
      filename: "real-estate-monthly-review.ts"
    }
  );

  const dataCoverageSource = await readFile(
    new URL("../lib/real-estate-data-coverage.ts", import.meta.url),
    "utf8"
  );
  const { outputText: dataCoverageOutput } = ts.transpileModule(
    dataCoverageSource,
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020
      }
    }
  );
  const dataCoverageModule = { exports: {} };

  vm.runInNewContext(
    dataCoverageOutput,
    {
      exports: dataCoverageModule.exports,
      module: dataCoverageModule,
      require: (specifier) => {
        if (specifier === "@/lib/real-estate-monthly-review") {
          return monthlyReviewModule.exports;
        }

        throw new Error(`Unexpected require: ${specifier}`);
      }
    },
    {
      filename: "real-estate-data-coverage.ts"
    }
  );

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
      module,
      require: (specifier) => {
        if (specifier === "@/lib/real-estate-monthly-review") {
          return monthlyReviewModule.exports;
        }

        if (specifier === "@/lib/real-estate-data-coverage") {
          return dataCoverageModule.exports;
        }

        throw new Error(`Unexpected require: ${specifier}`);
      }
    },
    {
      filename: "real-estate-annual-quality.ts"
    }
  );

  return module.exports;
}

const helpers = await loadQualityHelpers();
const today = new Date("2026-05-01T12:00:00.000Z");

function transaction(overrides) {
  return {
    id: "transaction-id",
    assetId: "property-1",
    bankConnectionId: null,
    provider: "plaid",
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
    rentPeriodMonth: null,
    note: null,
    ...overrides
  };
}

function monthlyReview(month, overrides = {}) {
  return {
    id: `review-${month}`,
    assetId: "property-1",
    reviewMonth: `${month}-01`,
    rentStatus: "ready",
    expenseStatus: "ready",
    closedAt: "2026-05-01T12:00:00.000Z",
    note: null,
    ...overrides
  };
}

function closedReviews(months) {
  return months.map((month) => monthlyReview(month));
}

function bankConnection(overrides = {}) {
  return {
    id: "bank-connection-id",
    assetId: "property-1",
    provider: "plaid",
    providerItemId: "item-id",
    accountId: "account-id",
    accountName: "Operating Checking",
    accountType: "depository",
    accountSubtype: "checking",
    institutionName: "Bank",
    institutionId: "bank-id",
    lastFour: "1234",
    status: "active",
    connectedAt: "2026-01-01T12:00:00.000Z",
    lastSyncedAt: "2026-02-01T12:00:00.000Z",
    rawTransactionsSyncedStartDate: "2026-01-01",
    rawTransactionsSyncedEndDate: "2026-01-31",
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
    bankConnections: [],
    monthlyReviews: [],
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
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
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
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
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
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
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
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
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

test("mock ledger transactions are hard blocking issues", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
      propertyTransactions: [
        transaction({
          postedAt: "2026-01-05",
          provider: "mock",
          classification: "rental_income"
        })
      ]
    }),
    "2026",
    today
  );

  assert.ok(issueCodes(result, "blocking").includes("mock_ledger_transactions"));
  assert.equal(
    helpers.hasHardBlockingAnnualQualityIssues([result]),
    true
  );
});

test("hard blocking gate ignores normal blocking issues", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
      propertyTransactions: []
    }),
    "2026",
    today
  );

  assert.deepEqual(issueCodes(result, "blocking"), ["missing_rent_months"]);
  assert.equal(
    helpers.hasHardBlockingAnnualQualityIssues([result]),
    false
  );
});

test("property without linked bank account does not block bank coverage", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyRent: 0,
      monthlyReviews: closedReviews(["2026-01"]),
      propertyTransactions: []
    }),
    "2026",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.ok(!issueCodes(result, "blocking").includes("incomplete_bank_coverage"));
});

test("closed historical bank-linked month with partial coverage does not block annual quality", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ],
      monthlyRent: 0,
      monthlyReviews: closedReviews(["2026-01"]),
      propertyTransactions: []
    }),
    "2026",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.ok(!issueCodes(result, "blocking").includes("incomplete_bank_coverage"));
});

test("open linked bank account with partial monthly coverage blocks annual quality", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ],
      monthlyRent: 0,
      monthlyReviews: [],
      propertyTransactions: []
    }),
    "2026",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.ok(issueCodes(result, "blocking").includes("incomplete_bank_coverage"));
  assert.deepEqual(
    Array.from(
      result.blockingIssues.find((issue) => issue.code === "incomplete_bank_coverage")
        .months
    ),
    ["2026-01"]
  );
  assert.equal(helpers.hasHardBlockingAnnualQualityIssues([result]), true);
});

test("open disconnected linked bank account blocks annual quality", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      bankConnections: [
        bankConnection({
          status: "disconnected"
        })
      ],
      monthlyRent: 0,
      monthlyReviews: [],
      propertyTransactions: []
    }),
    "2026",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.ok(issueCodes(result, "blocking").includes("incomplete_bank_coverage"));
  assert.deepEqual(
    Array.from(
      result.blockingIssues.find((issue) => issue.code === "incomplete_bank_coverage")
        .months
    ),
    ["2026-01"]
  );
  assert.equal(helpers.hasHardBlockingAnnualQualityIssues([result]), true);
});

test("ignored transactions are normal review decisions", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
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
  assert.deepEqual(issueCodes(result, "warning"), ["no_expenses_recorded"]);
});

test("future months are not checked", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
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

test("current in-progress month is not required for annual quality", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03"]),
      propertyTransactions: [
        transaction({ postedAt: "2026-01-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-02-05", classification: "rental_income" }),
        transaction({ postedAt: "2026-03-05", classification: "rental_income" })
      ]
    }),
    "2026",
    new Date("2026-04-30T12:00:00.000Z")
  );

  assert.ok(!issueCodes(result, "blocking").includes("open_monthly_reviews"));
  assert.ok(!issueCodes(result, "blocking").includes("missing_rent_months"));
});

test("purchase date skips months before purchase", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      purchasedAt: "2026-03-15",
      monthlyReviews: closedReviews(["2026-03", "2026-04"]),
      propertyTransactions: [
        transaction({ postedAt: "2026-03-20", classification: "rental_income" })
      ]
    }),
    "2026",
    today
  );

  assert.deepEqual(Array.from(result.blockingIssues[0].months), ["2026-04"]);
});

test("open monthly reviews block annual export before missing rent noise", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      monthlyReviews: closedReviews(["2026-01"]),
      propertyTransactions: [
        transaction({ postedAt: "2026-01-05", classification: "rental_income" })
      ]
    }),
    "2026",
    today
  );

  assert.deepEqual(issueCodes(result, "blocking"), ["open_monthly_reviews"]);
  assert.deepEqual(Array.from(result.blockingIssues[0].months), [
    "2026-02",
    "2026-03",
    "2026-04"
  ]);
});

test("rent period month satisfies annual rent quality for early payments", () => {
  const result = helpers.getPropertyAnnualQualityResult(
    property({
      purchasedAt: "2026-02-01",
      monthlyReviews: closedReviews(["2026-02"]),
      propertyTransactions: [
        transaction({
          postedAt: "2026-01-31",
          classification: "rental_income",
          rentPeriodMonth: "2026-02-01"
        })
      ]
    }),
    "2026",
    new Date("2026-02-28T12:00:00.000Z")
  );

  assert.ok(!issueCodes(result, "blocking").includes("missing_rent_months"));
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
        monthlyReviews: closedReviews(["2026-01", "2026-02", "2026-03", "2026-04"]),
        propertyTransactions: []
      })
    ],
    "2026",
    today
  );

  assert.equal(helpers.hasBlockingAnnualQualityIssues(results), true);
  assert.equal(helpers.getBlockingAnnualQualityIssues(results).length, 1);
});
