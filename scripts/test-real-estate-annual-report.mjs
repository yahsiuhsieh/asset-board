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

const transactionNoteHelpers = await loadTsModule(
  "../lib/real-estate-transaction-notes.ts"
);
const annualStatementHelpers = await loadTsModule(
  "../lib/real-estate-annual-statement.ts",
  {
    "@/lib/real-estate-transaction-notes": transactionNoteHelpers
  }
);
const transactionExportHelpers = await loadTsModule(
  "../lib/real-estate-transaction-export.ts",
  {
    "@/lib/real-estate-transaction-notes": transactionNoteHelpers
  }
);
const helpers = await loadTsModule("../lib/real-estate-annual-report.ts", {
  "@/lib/real-estate-annual-quality": {
    isHardBlockingAnnualQualityIssue: (issue) =>
      issue.code === "mock_ledger_transactions" ||
      issue.code === "incomplete_bank_coverage"
  },
  "@/lib/real-estate-annual-statement": annualStatementHelpers,
  "@/lib/real-estate-transaction-export": transactionExportHelpers
});

const generatedAt = new Date("2026-04-30T12:00:00.000Z");

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

function property(overrides) {
  return {
    id: "property-1",
    name: "Duplex A",
    type: "real-estate",
    value: 500000,
    address: "100 Main St",
    rentalStatus: "rented",
    latitude: null,
    longitude: null,
    mapZoom: 12,
    currentMarketValueSyncedAt: null,
    county: "Travis",
    purchasedAt: "2026-01-10",
    parcelNumber: "P-100",
    purchasePrice: 450000,
    currentMarketValue: 500000,
    remainingMortgageBalance: 300000,
    monthlyRent: 2000,
    monthlyMortgage: 1200,
    buildingCost: 300000,
    landCost: 150000,
    totalDepreciation: 0,
    rentCollectionMonth: null,
    rentCollectedAmount: 0,
    rentCollectedAt: null,
    rentMatchTolerance: 50,
    propertyTransactions: [],
    photos: [],
    snapshots: [],
    bankConnections: [],
    monthlyReviews: [],
    ...overrides
  };
}

function qualityResult(overrides) {
  return {
    propertyId: "property-1",
    propertyName: "Duplex A",
    rentalStatus: "rented",
    issues: [],
    blockingIssues: [],
    warningIssues: [],
    ...overrides
  };
}

test("builds annual report model from statement, transactions, and quality results", () => {
  const report = helpers.getPortfolioAnnualReportModel(
    [
      property({
        id: "property-1",
        propertyTransactions: [
          transaction({
            id: "rent-jan",
            postedAt: "2026-01-05",
            amount: 2000,
            classification: "rental_income"
          }),
          transaction({
            id: "taxes",
            postedAt: "2026-01-15",
            amount: 300,
            direction: "debit",
            classification: "expense",
            category: "taxes"
          }),
          transaction({
            id: "old-rent",
            postedAt: "2025-12-31",
            amount: 2000,
            classification: "rental_income"
          })
        ]
      }),
      property({
        id: "property-2",
        name: "Condo B",
        address: "200 Oak Ave",
        county: "Williamson",
        parcelNumber: "P-200",
        purchasedAt: "2026-03-05",
        currentMarketValue: 250000,
        remainingMortgageBalance: 100000,
        purchasePrice: 230000,
        monthlyRent: 1500,
        monthlyMortgage: 800,
        propertyTransactions: [
          transaction({
            id: "rent-mar",
            assetId: "property-2",
            postedAt: "2026-03-05",
            amount: 1500,
            classification: "rental_income"
          }),
          transaction({
            id: "maintenance",
            assetId: "property-2",
            postedAt: "2026-03-20",
            amount: 200,
            direction: "debit",
            classification: "expense",
            category: "maintenance"
          })
        ]
      })
    ],
    "2026",
    [
      qualityResult({
        propertyId: "property-1",
        warningIssues: [{ id: "warning-1", code: "no_expenses_recorded" }],
        issues: [{ id: "warning-1", code: "no_expenses_recorded" }]
      }),
      qualityResult({
        propertyId: "property-2",
        propertyName: "Condo B",
        blockingIssues: [{ id: "blocking-1", code: "open_monthly_reviews" }],
        issues: [{ id: "blocking-1", code: "open_monthly_reviews" }]
      })
    ],
    generatedAt
  );

  assert.equal(report.year, "2026");
  assert.equal(report.generatedAt, generatedAt.toISOString());
  assert.equal(report.portfolio.propertyCount, 2);
  assert.equal(report.portfolio.currentValue, 750000);
  assert.equal(report.portfolio.mortgageBalance, 400000);
  assert.equal(report.statement.totalRow.rentCollected, 3500);
  assert.equal(report.statement.totalRow.totalOperatingExpenses, 500);
  assert.equal(report.statement.totalRow.noi, 3000);
  assert.equal(report.status.label, "Needs Review");
  assert.equal(report.status.blockingIssueCount, 1);
  assert.equal(report.status.warningIssueCount, 1);
  assert.equal(report.transactionSummary.totalCount, 4);
  assert.equal(report.transactionSummary.rentalIncomeCount, 2);
  assert.equal(report.transactionSummary.expenseCount, 2);
  assert.equal(report.expenseCategoryRows.find((row) => row.category === "taxes").amount, 300);
  assert.equal(
    report.expenseCategoryRows.find((row) => row.category === "maintenance").amount,
    200
  );
  assert.equal(report.propertyScorecards[0].expectedRent, 8000);
  assert.equal(report.propertyScorecards[0].rentVariance, -6000);
  assert.equal(report.propertyScorecards[1].expectedRent, 3000);
  assert.equal(report.propertyScorecards[1].rentVariance, -1500);
});

test("flags hard blockers and limits appendix preview rows", () => {
  const transactions = Array.from({ length: 30 }, (_, index) =>
    transaction({
      id: `expense-${index}`,
      postedAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
      amount: 10,
      direction: "debit",
      classification: "expense",
      category: "other"
    })
  );
  const report = helpers.getPortfolioAnnualReportModel(
    [
      property({
        propertyTransactions: transactions
      })
    ],
    "2026",
    [
      qualityResult({
        blockingIssues: [
          { id: "mock-blocker", code: "mock_ledger_transactions" }
        ],
        issues: [{ id: "mock-blocker", code: "mock_ledger_transactions" }]
      })
    ],
    generatedAt
  );

  assert.equal(report.status.label, "Blocked");
  assert.equal(report.status.hardBlockingIssueCount, 1);
  assert.equal(report.transactionSummary.totalCount, 30);
  assert.equal(report.transactionSummary.previewLimit, 25);
  assert.equal(report.transactionSummary.previewRows.length, 25);
  assert.equal(report.transactionSummary.previewRows[0].date, "2026-01-01");
  assert.equal(report.transactionSummary.previewRows[24].date, "2026-01-25");
});
