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
      Date,
      fetch: async () => {
        throw new Error("Unexpected fetch call.");
      },
      Intl,
      URLSearchParams,
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
const annualPeriodHelpers = await loadTsModule(
  "../lib/real-estate-annual-period.ts"
);
const monthlyReviewHelpers = await loadTsModule(
  "../lib/real-estate-monthly-review.ts"
);
const dataCoverageHelpers = await loadTsModule(
  "../lib/real-estate-data-coverage.ts",
  {
    "@/lib/real-estate-monthly-review": monthlyReviewHelpers
  }
);
const annualQualityHelpers = await loadTsModule(
  "../lib/real-estate-annual-quality.ts",
  {
    "@/lib/real-estate-annual-period": annualPeriodHelpers,
    "@/lib/real-estate-data-coverage": dataCoverageHelpers,
    "@/lib/real-estate-monthly-review": monthlyReviewHelpers
  }
);
const annualQualityDisplayHelpers = await loadTsModule(
  "../lib/real-estate-annual-quality-display.ts",
  {
    "@/lib/real-estate-annual-quality": annualQualityHelpers
  }
);
const annualStatementHelpers = await loadTsModule(
  "../lib/real-estate-annual-statement.ts",
  {
    "@/lib/real-estate-annual-period": annualPeriodHelpers,
    "@/lib/real-estate-transaction-notes": transactionNoteHelpers
  }
);
const transactionExportHelpers = await loadTsModule(
  "../lib/real-estate-transaction-export.ts",
  {
    "@/lib/real-estate-annual-period": annualPeriodHelpers,
    "@/lib/real-estate-transaction-notes": transactionNoteHelpers
  }
);
const annualReportHelpers = await loadTsModule(
  "../lib/real-estate-annual-report.ts",
  {
    "@/lib/real-estate-annual-period": annualPeriodHelpers,
    "@/lib/real-estate-annual-quality": annualQualityHelpers,
    "@/lib/real-estate-annual-statement": annualStatementHelpers,
    "@/lib/real-estate-transaction-export": transactionExportHelpers
  }
);
const semiannualEmailHelpers = await loadTsModule(
  "../lib/real-estate-semiannual-report-email.ts",
  {
    "@/lib/real-estate-annual-quality": annualQualityHelpers,
    "@/lib/real-estate-annual-quality-display": annualQualityDisplayHelpers
  }
);
const semiannualHelpers = await loadTsModule(
  "../lib/real-estate-semiannual-report.ts",
  {
    "@/lib/real-estate": {
      getRealEstateAssetsWithCoverPhoto: async () => {
        throw new Error("loadProperties dependency was not provided.");
      }
    },
    "@/lib/real-estate-annual-period": annualPeriodHelpers,
    "@/lib/real-estate-annual-quality": annualQualityHelpers,
    "@/lib/real-estate-annual-report": annualReportHelpers,
    "@/lib/real-estate-semiannual-report-email": semiannualEmailHelpers
  }
);

function monthString(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function months(year, startMonth, endMonth) {
  return Array.from({ length: endMonth - startMonth + 1 }, (_, index) =>
    monthString(year, startMonth + index)
  );
}

function closedReviews(year, startMonth, endMonth) {
  return months(year, startMonth, endMonth).map((reviewMonth) => ({
    closedAt: `${reviewMonth}-28T12:00:00.000Z`,
    id: `review-${reviewMonth}`,
    note: null,
    reviewMonth
  }));
}

function transaction(overrides) {
  return {
    accountId: "account-id",
    accountName: "Operating Checking",
    amount: 1000,
    assetId: "property-1",
    bankConnectionId: null,
    category: null,
    classification: "rental_income",
    description: "Transaction",
    direction: "credit",
    id: "transaction-id",
    memo: null,
    note: null,
    originalDescription: null,
    postedAt: "2026-01-05",
    provider: "plaid",
    providerTransactionId: "provider-transaction-id",
    rawBankTransactionId: null,
    rentPeriodMonth: null,
    ...overrides
  };
}

function rentTransactions(year, startMonth, endMonth, amount = 1000) {
  return months(year, startMonth, endMonth).map((month) =>
    transaction({
      amount,
      id: `rent-${month}`,
      postedAt: `${month}-05`,
      rentPeriodMonth: `${month}-01`
    })
  );
}

function property(overrides = {}) {
  return {
    address: "100 Main St",
    bankConnections: [],
    buildingCost: 300000,
    cashInvested: 100000,
    county: "Cook",
    coverPhoto: null,
    currentMarketValue: 500000,
    currentMarketValueSyncedAt: null,
    id: "property-1",
    landCost: 150000,
    latitude: null,
    longitude: null,
    mapZoom: 12,
    monthlyMortgage: 500,
    monthlyRent: 1000,
    monthlyReviews: [],
    name: "House 1",
    parcelNumber: "P-100",
    propertyTransactions: [],
    purchasePrice: 450000,
    purchasedAt: "2026-01-01",
    remainingMortgageBalance: 300000,
    rentMatchTolerance: 50,
    rentalStatus: "rented",
    snapshots: [],
    totalDepreciation: 0,
    type: "real-estate",
    value: 500000,
    ...overrides
  };
}

function testEnv(overrides = {}) {
  return {
    ASSETBOARD_APP_URL: "https://assetboard.test",
    MONTHLY_REVIEW_NOTIFY_EMAIL_FROM: "AssetBoard <onboarding@resend.dev>",
    MONTHLY_REVIEW_NOTIFY_EMAIL_TO: "owner@example.com",
    RESEND_API_KEY: "test-key",
    ...overrides
  };
}

test("resolves January and July scheduled report periods", () => {
  const januaryPeriod = semiannualHelpers.getDefaultSemiannualReportPeriod(
    new Date("2026-01-10T14:00:00.000Z")
  );
  const julyPeriod = semiannualHelpers.getDefaultSemiannualReportPeriod(
    new Date("2026-07-10T14:00:00.000Z")
  );

  assert.equal(januaryPeriod.periodLabel, "2025");
  assert.equal(januaryPeriod.throughMonth, "2025-12");
  assert.equal(januaryPeriod.year, "2025");
  assert.equal(julyPeriod.periodLabel, "2026 H1");
  assert.equal(julyPeriod.throughMonth, "2026-06");
  assert.equal(julyPeriod.year, "2026");
});

test("dry run builds ready H1 summary, stable report link, and does not fetch", async () => {
  let fetchCalled = false;
  const result = await semiannualHelpers.runSemiannualRealEstateReport({
    dependencies: {
      loadProperties: async () => [
        property({
          monthlyReviews: closedReviews(2026, 1, 6),
          propertyTransactions: [
            ...rentTransactions(2026, 1, 6),
            transaction({
              amount: 250,
              category: "maintenance",
              classification: "expense",
              description: "Plumbing repair",
              direction: "debit",
              id: "expense-may",
              postedAt: "2026-05-15"
            }),
            transaction({
              amount: 999,
              classification: null,
              description: "October transaction outside H1",
              direction: "debit",
              id: "outside-h1",
              postedAt: "2026-10-15"
            })
          ]
        })
      ]
    },
    dryRun: true,
    env: testEnv(),
    fetchImpl: async () => {
      fetchCalled = true;
      return { json: async () => ({ id: "email-id" }), ok: true };
    },
    now: new Date("2026-07-10T14:00:00.000Z")
  });

  assert.equal(result.year, "2026");
  assert.equal(result.throughMonth, "2026-06");
  assert.equal(result.periodLabel, "2026 H1");
  assert.equal(
    result.reportUrl,
    "https://assetboard.test/real-estate/annual-report?year=2026&throughMonth=2026-06"
  );
  assert.equal(result.requiresReview, false);
  assert.equal(result.notification.status, "dry_run");
  assert.equal(result.notification.subject, "Annual Report Ready: 2026 H1");
  assert.match(result.notification.html, /Open Annual Report/);
  assert.match(result.notification.text, /Rent collected: \$6,000/);
  assert.equal(result.properties[0].rentCollected, 6000);
  assert.equal(result.properties[0].operatingExpenses, 250);
  assert.equal(fetchCalled, false);
});

test("open monthly reviews block the report email", async () => {
  const result = await semiannualHelpers.runSemiannualRealEstateReport({
    dependencies: {
      loadProperties: async () => [
        property({
          monthlyReviews: closedReviews(2026, 1, 5),
          propertyTransactions: rentTransactions(2026, 1, 5)
        })
      ]
    },
    dryRun: true,
    env: testEnv(),
    now: new Date("2026-07-10T14:00:00.000Z")
  });

  assert.equal(result.requiresReview, true);
  assert.equal(result.notification.subject, "Annual Report Needs Review: 2026 H1");
  assert.equal(result.properties[0].status, "needs_review");
  assert.equal(result.properties[0].blockingIssues[0].issue.code, "open_monthly_reviews");
  assert.match(result.notification.text, /Blocking: Open monthly reviews/);
});

test("blocking annual quality issues are mapped into property summaries", async () => {
  const result = await semiannualHelpers.runSemiannualRealEstateReport({
    dependencies: {
      loadProperties: async () => [
        property({
          monthlyRent: 0,
          monthlyReviews: closedReviews(2026, 1, 6),
          propertyTransactions: [
            transaction({
              amount: 85,
              classification: null,
              description: "Unclassified debit",
              direction: "debit",
              id: "unclassified-may",
              postedAt: "2026-05-20"
            })
          ]
        })
      ]
    },
    dryRun: true,
    env: testEnv(),
    now: new Date("2026-07-10T14:00:00.000Z")
  });

  assert.equal(result.requiresReview, true);
  assert.equal(
    result.properties[0].blockingIssues[0].issue.code,
    "unclassified_expense_transactions"
  );
  assert.match(result.notification.html, /Unclassified expense transactions/);
});

test("January full-year report link omits throughMonth", async () => {
  const result = await semiannualHelpers.runSemiannualRealEstateReport({
    dependencies: {
      loadProperties: async () => [
        property({
          monthlyReviews: closedReviews(2025, 1, 12),
          propertyTransactions: rentTransactions(2025, 1, 12),
          purchasedAt: "2025-01-01"
        })
      ]
    },
    dryRun: true,
    env: testEnv(),
    now: new Date("2026-01-10T14:00:00.000Z")
  });

  assert.equal(result.year, "2025");
  assert.equal(result.periodLabel, "2025");
  assert.equal(
    result.reportUrl,
    "https://assetboard.test/real-estate/annual-report?year=2025"
  );
  assert.equal(result.notification.subject, "Annual Report Ready: 2025");
});

test("missing email env skips send without failing", async () => {
  const rendered = semiannualEmailHelpers.renderSemiannualReportEmail({
    dryRun: false,
    generatedAt: "2026-07-10T14:00:00.000Z",
    periodLabel: "2026 H1",
    portfolio: {
      cashFlowAfterDebtService: 5500,
      noi: 5750,
      operatingExpenses: 250,
      propertyCount: 1,
      rentCollected: 6000,
      transactionCount: 7
    },
    properties: [
      {
        blockingIssues: [],
        cashFlowAfterDebtService: 5500,
        expenseTransactionCount: 1,
        noi: 5750,
        operatingExpenses: 250,
        propertyName: "House 1",
        rentCollected: 6000,
        status: "ready",
        warningIssues: []
      }
    ],
    reportUrl:
      "https://assetboard.test/real-estate/annual-report?year=2026&throughMonth=2026-06",
    requiresReview: false,
    throughMonth: "2026-06",
    year: "2026"
  });

  assert.equal(rendered.subject, "Annual Report Ready: 2026 H1");
  assert.match(rendered.html, /House 1/);
  assert.match(rendered.text, /Report: https:\/\/assetboard.test/);

  let fetchCalled = false;
  const result = await semiannualEmailHelpers.sendSemiannualReportEmail({
    env: {},
    fetchImpl: async () => {
      fetchCalled = true;
      return { json: async () => ({ id: "email-id" }), ok: true };
    },
    summary: {
      dryRun: false,
      generatedAt: "2026-07-10T14:00:00.000Z",
      periodLabel: "2026 H1",
      portfolio: {
        cashFlowAfterDebtService: 5500,
        noi: 5750,
        operatingExpenses: 250,
        propertyCount: 1,
        rentCollected: 6000,
        transactionCount: 7
      },
      properties: [
        {
          blockingIssues: [],
          cashFlowAfterDebtService: 5500,
          expenseTransactionCount: 1,
          noi: 5750,
          operatingExpenses: 250,
          propertyName: "House 1",
          rentCollected: 6000,
          status: "ready",
          warningIssues: []
        }
      ],
      reportUrl:
        "https://assetboard.test/real-estate/annual-report?year=2026&throughMonth=2026-06",
      requiresReview: false,
      throughMonth: "2026-06",
      year: "2026"
    }
  });

  assert.equal(result.status, "skipped");
  assert.match(result.warning, /RESEND_API_KEY/);
  assert.equal(fetchCalled, false);
});
