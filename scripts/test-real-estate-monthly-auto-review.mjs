import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadTsModule(relativePath, mocks = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
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
      fetch: async () => {
        throw new Error("Unexpected fetch call.");
      },
      module,
      process,
      require: (specifier) => {
        if (specifier in mocks) {
          return mocks[specifier];
        }

        throw new Error(`Unexpected require: ${specifier}`);
      }
    },
    {
      filename: relativePath
    }
  );

  return module.exports;
}

const monthlyReviewHelpers = await loadTsModule("../lib/real-estate-monthly-review.ts");
const emailHelpers = await loadTsModule("../lib/real-estate-monthly-review-email.ts");

function createServiceMocks({
  coverageStatus = "complete",
  getProperty,
  onSupabase = () => {
    throw new Error("Unexpected Supabase call.");
  },
  onFetchBankTransactions = () => {
    throw new Error("Unexpected bank transaction fetch.");
  }
} = {}) {
  class PlaidItemDisconnectedError extends Error {}

  return {
    "@/lib/banking/transaction-provider": {
      fetchBankTransactions: onFetchBankTransactions,
      PlaidItemDisconnectedError
    },
    "@/lib/real-estate": {
      getActiveRealEstateTransactionRules: async () => [],
      getRealEstateAssetDetail: async () => getProperty()
    },
    "@/lib/real-estate-bank-connections": {
      getPlaidItemConnectionKey: (connection) =>
        connection.provider_item_id || connection.access_token,
      getUniquePlaidAccountConnections: (connections) => connections
    },
    "@/lib/real-estate-data-coverage": {
      getMonthlyDataCoverageAssessment: (_property, month) => ({
        accounts: [],
        activeAccountCount: 1,
        closedAt: null,
        disconnectedAccountCount: 0,
        endDate: `${month.slice(0, 7)}-30`,
        isReviewMonthComplete: true,
        reviewMonth: month.slice(0, 7),
        startDate: `${month.slice(0, 7)}-01`,
        status: coverageStatus
      }),
      isMonthlyDataCoverageCloseBlocked: (assessment) =>
        assessment.status === "needs_reconnect" || assessment.status === "needs_sync"
    },
    "@/lib/real-estate-monthly-review": monthlyReviewHelpers,
    "@/lib/real-estate-monthly-transaction-sync": {
      filterRentCreditDecisionsForReviewScope: () => [],
      getMonthlyExpenseDebitSyncDecisions: () => [],
      getMonthlyRentCreditSyncDecisions: () => []
    },
    "@/lib/real-estate-transaction-ownership": {
      getClaimedRawBankTransactionIdsForOtherAssets: () => new Set(),
      getPendingRawBankTransactionCleanupDescriptionsByRawId: () => new Map(),
      getPendingRawBankTransactionIdsClaimedByOtherAssets: () => new Set(),
      getUnreviewedRawBankTransactionClaimDescriptionsByRawId: () => new Map(),
      isRawBankTransactionClaimingClassification: (classification) =>
        classification === "rental_income" || classification === "expense"
    },
    "@/lib/real-estate-transaction-rules": {
      findMatchingTransactionRule: () => null
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: onSupabase
    }
  };
}

async function loadServiceModule(options = {}) {
  return loadTsModule(
    "../lib/real-estate-monthly-review-service.ts",
    createServiceMocks(options)
  );
}

async function loadAutoReviewModule(serviceMock = {}) {
  return loadTsModule("../lib/real-estate-monthly-auto-review.ts", {
    "@/lib/real-estate": {
      getRealEstateAssetsWithCoverPhoto: async () => []
    },
    "@/lib/real-estate-monthly-review": monthlyReviewHelpers,
    "@/lib/real-estate-monthly-review-email": emailHelpers,
    "@/lib/real-estate-monthly-review-service": {
      closeRealEstateMonthlyReview: async () => {
        throw new Error("Unexpected close call.");
      },
      MONTHLY_AUTO_REVIEW_CLOSE_NOTE:
        "Automatically closed by monthly auto review after rent and expense sync.",
      ...serviceMock
    }
  });
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
    description: "Rent",
    direction: "credit",
    id: "transaction-id",
    memo: null,
    note: null,
    postedAt: "2026-06-03",
    provider: "plaid",
    providerTransactionId: "provider-transaction-id",
    rawBankTransactionId: null,
    rentPeriodMonth: "2026-06-01",
    ...overrides
  };
}

function property(overrides = {}) {
  return {
    address: "123 Main St",
    annualOperatingExpenses: 0,
    bankConnections: [],
    buildingCost: 0,
    cashInvested: 100000,
    coverPhoto: null,
    currentMarketValue: 200000,
    id: "property-1",
    landCost: 0,
    monthlyMortgage: 0,
    monthlyRent: 1000,
    monthlyReviews: [],
    name: "Test Property",
    propertyTransactions: [
      transaction({ amount: 1000, classification: "rental_income" })
    ],
    purchasedAt: "2026-01-01",
    purchasePrice: 200000,
    remainingMortgageBalance: 0,
    rentalStatus: "rented",
    snapshots: [],
    totalDepreciation: 0,
    ...overrides
  };
}

function closeResult(overrides = {}) {
  return {
    affectedAssetIds: [],
    assessment: {
      closedAt: null,
      expenseStatus: "ready",
      ignoredExpenseCount: 0,
      isReadyToClose: true,
      isReviewMonthComplete: true,
      missingExpenseCategoryCount: 0,
      note: null,
      recordedExpenseCount: 0,
      recordedExpenses: 0,
      rentCollected: 1000,
      rentStatus: "ready",
      reviewMonth: "2026-06",
      reviewMonthDate: "2026-06-01",
      status: "ready_to_close",
      targetRent: 1000,
      unclassifiedExpenseCount: 0,
      unclassifiedRentCreditCount: 0
    },
    blockers: [],
    coverageAssessment: null,
    expenseSyncResult: null,
    message: "",
    rentSyncResult: null,
    status: "closed",
    wroteLedgerRows: false,
    ...overrides
  };
}

test("previous month calculation uses UTC and handles year boundaries", async () => {
  const autoReview = await loadAutoReviewModule();

  assert.equal(
    autoReview.getPreviousReviewMonth(new Date("2026-07-05T14:00:00.000Z")),
    "2026-06"
  );
  assert.equal(
    autoReview.getPreviousReviewMonth(new Date("2026-01-05T14:00:00.000Z")),
    "2025-12"
  );
});

test("close blocker mapping includes review, category, and bank coverage blockers", async () => {
  const service = await loadServiceModule();
  const reviewBlockers = service.getMonthlyReviewCloseBlockers({
    isReviewMonthComplete: true,
    missingExpenseCategoryCount: 1,
    rentStatus: "needs_review",
    reviewMonth: "2026-06",
    unclassifiedExpenseCount: 3,
    unclassifiedRentCreditCount: 2
  });

  assert.deepEqual(Array.from(reviewBlockers), [
    "rent not ready",
    "2 rent credits need review",
    "3 expense transactions need review",
    "1 expense transaction is missing category"
  ]);
  assert.deepEqual(
    Array.from(service.getMonthlyDataCoverageCloseBlockers({ status: "needs_sync" })),
    ["bank coverage needs sync"]
  );
  assert.deepEqual(
    Array.from(
      service.getMonthlyDataCoverageCloseBlockers({ status: "needs_reconnect" })
    ),
    ["bank account needs reconnect"]
  );
});

test("dry run passes through as read-only and returns would-close summary", async () => {
  const autoReview = await loadAutoReviewModule();
  const closeCalls = [];
  const sendCalls = [];
  const result = await autoReview.runMonthlyRealEstateAutoReview({
    dependencies: {
      closeMonthlyReview: async (input) => {
        closeCalls.push(input);
        return closeResult({ status: "would_close" });
      },
      loadProperties: async () => [property()],
      sendEmail: async (input) => {
        sendCalls.push(input);
        return {
          html: "<p>dry</p>",
          status: "dry_run",
          subject: "dry",
          text: "dry",
          warning: "Dry run: email was not sent."
        };
      }
    },
    dryRun: true,
    now: new Date("2026-07-05T14:00:00.000Z"),
    reviewMonth: "2026-06"
  });

  assert.equal(closeCalls.length, 1);
  assert.equal(closeCalls[0].dryRun, true);
  assert.equal(closeCalls[0].reviewMonth, "2026-06-01");
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].summary.dryRun, true);
  assert.equal(result.properties[0].status, "would_close");
  assert.equal(result.notification.status, "dry_run");
});

test("service dry run does not write a close row", async () => {
  let supabaseCalls = 0;
  const currentProperty = property();
  const service = await loadServiceModule({
    getProperty: () => currentProperty,
    onSupabase: () => {
      supabaseCalls += 1;
      throw new Error("Dry run should not create Supabase client.");
    }
  });
  const result = await service.closeRealEstateMonthlyReview({
    assetId: currentProperty.id,
    dryRun: true,
    note: "dry",
    now: new Date("2026-07-05T14:00:00.000Z"),
    reviewMonth: "2026-06-01"
  });

  assert.equal(result.status, "would_close");
  assert.equal(supabaseCalls, 0);
});

test("already closed month skips writes and returns already_closed", async () => {
  let supabaseCalls = 0;
  const currentProperty = property({
    monthlyReviews: [
      {
        assetId: "property-1",
        closedAt: "2026-07-01T00:00:00.000Z",
        id: "review-1",
        note: null,
        reviewMonth: "2026-06-01"
      }
    ]
  });
  const service = await loadServiceModule({
    getProperty: () => currentProperty,
    onSupabase: () => {
      supabaseCalls += 1;
      throw new Error("Already closed month should not create Supabase client.");
    }
  });
  const result = await service.closeRealEstateMonthlyReview({
    assetId: currentProperty.id,
    note: "close",
    now: new Date("2026-07-05T14:00:00.000Z"),
    reviewMonth: "2026-06-01"
  });

  assert.equal(result.status, "already_closed");
  assert.equal(supabaseCalls, 0);
});

test("sync errors become property blockers without stopping the batch", async () => {
  const autoReview = await loadAutoReviewModule();
  const result = await autoReview.runMonthlyRealEstateAutoReview({
    dependencies: {
      closeMonthlyReview: async () => {
        throw new Error("Plaid item disconnected");
      },
      loadProperties: async () => [property()],
      sendEmail: async ({ summary }) => ({
        html: "<p>needs review</p>",
        status: "dry_run",
        subject: summary.requiresReview ? "needs" : "closed",
        text: "needs review",
        warning: "mock"
      })
    },
    dryRun: true,
    now: new Date("2026-07-05T14:00:00.000Z"),
    reviewMonth: "2026-06"
  });

  assert.equal(result.requiresReview, true);
  assert.equal(result.properties[0].status, "error");
  assert.deepEqual(Array.from(result.properties[0].blockers), [
    "sync error: Plaid item disconnected"
  ]);
});

test("email renderer includes HTML, text fallback, status, blockers, and review links", () => {
  const rendered = emailHelpers.renderMonthlyReviewEmail({
    dryRun: false,
    properties: [
      {
        assetId: "property-1",
        blockers: ["bank coverage needs sync"],
        error: null,
        missingExpenseCategoryCount: 1,
        pendingExpenseTransactionCount: 2,
        pendingRentCreditCount: 3,
        propertyName: "Test Property",
        reviewUrl:
          "https://assetboard.example/real-estate/property-1?reviewMonth=2026-06#monthly-review",
        ruleMatchedExpenseCount: 4,
        status: "blocked",
        syncedRentCount: 5
      }
    ],
    requiresReview: true,
    reviewMonth: "2026-06"
  });

  assert.equal(
    rendered.subject,
    "AssetBoard monthly review needs review: 2026-06"
  );
  assert.match(rendered.html, /<table/);
  assert.match(rendered.html, /bank coverage needs sync/);
  assert.match(rendered.html, /Open monthly review/);
  assert.match(rendered.text, /Test Property: Needs review/);
  assert.match(rendered.text, /Review: https:\/\/assetboard\.example/);
});
