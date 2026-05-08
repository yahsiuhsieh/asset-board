import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadMonthlyReviewHelpers() {
  const source = await readFile(
    new URL("../lib/real-estate-monthly-review.ts", import.meta.url),
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
      filename: "real-estate-monthly-review.ts"
    }
  );

  return module.exports;
}

async function loadMonthlyTransactionSyncHelpers() {
  const source = await readFile(
    new URL("../lib/real-estate-monthly-transaction-sync.ts", import.meta.url),
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
      filename: "real-estate-monthly-transaction-sync.ts"
    }
  );

  return module.exports;
}

const helpers = await loadMonthlyReviewHelpers();
const syncHelpers = await loadMonthlyTransactionSyncHelpers();
const afterFebruary = new Date("2026-03-01T12:00:00.000Z");

function transaction(overrides) {
  return {
    id: "transaction-id",
    assetId: "property-1",
    bankConnectionId: null,
    provider: "plaid",
    providerTransactionId: "provider-transaction-id",
    accountId: "account-id",
    accountName: "Operating Checking",
    postedAt: "2026-02-01",
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

function monthlyReview(overrides) {
  return {
    id: "review-id",
    assetId: "property-1",
    reviewMonth: "2026-02-01",
    rentStatus: "ready",
    expenseStatus: "ready",
    closedAt: null,
    note: null,
    ...overrides
  };
}

function property(overrides) {
  return {
    id: "property-1",
    rentalStatus: "rented",
    purchasedAt: "2026-01-01",
    monthlyRent: 1800,
    propertyTransactions: [],
    monthlyReviews: [],
    ...overrides
  };
}

function bankTransaction(overrides) {
  return {
    id: "bank-transaction-id",
    connectionId: "connection-id",
    postedAt: "2026-02-05",
    title: "Tenant rent",
    memo: "Tenant rent",
    description: "Tenant rent",
    amount: 1800,
    direction: "credit",
    accountId: "account-id",
    accountName: "Operating Checking",
    ...overrides
  };
}

function syncClassification(overrides) {
  return {
    id: "ledger-id",
    classification: "rental_income",
    rent_period_month: null,
    ...overrides
  };
}

test("early rent allocation satisfies the rent review month", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      propertyTransactions: [
        transaction({
          postedAt: "2026-01-31",
          amount: 1800,
          rentPeriodMonth: "2026-02-01"
        })
      ]
    }),
    "2026-02",
    afterFebruary
  );

  assert.equal(assessment.rentStatus, "ready");
  assert.equal(assessment.rentCollected, 1800);
  assert.equal(assessment.status, "ready_to_close");
  assert.equal(assessment.isReadyToClose, true);
  assert.equal(assessment.isReviewMonthComplete, true);
});

test("out-of-month rent income does not satisfy a missing review month without allocation", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      propertyTransactions: [
        transaction({
          id: "january-rent",
          postedAt: "2026-01-30",
          amount: 1800,
          classification: "rental_income"
        }),
        transaction({
          id: "march-rent",
          postedAt: "2026-03-02",
          amount: 1800,
          classification: "rental_income"
        })
      ]
    }),
    "2026-02",
    afterFebruary
  );

  assert.equal(assessment.rentStatus, "needs_review");
  assert.equal(assessment.rentCollected, 0);
  assert.equal(assessment.isReadyToClose, false);
});

test("pending rent credits block rent readiness until reviewed", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      propertyTransactions: [
        transaction({
          id: "february-rent",
          postedAt: "2026-02-03",
          amount: 1800,
          classification: "rental_income"
        }),
        transaction({
          id: "unreviewed-credit",
          postedAt: "2026-01-30",
          amount: 1800,
          classification: null,
          rentPeriodMonth: "2026-02-01"
        })
      ]
    }),
    "2026-02",
    afterFebruary
  );

  assert.equal(assessment.rentCollected, 1800);
  assert.equal(assessment.unclassifiedRentCreditCount, 1);
  assert.equal(assessment.rentStatus, "needs_review");
  assert.equal(assessment.isReadyToClose, false);
});

test("ignored debit transactions do not block expense readiness", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-07",
          amount: 1800,
          direction: "credit",
          classification: "rental_income"
        }),
        transaction({
          postedAt: "2026-02-10",
          amount: 42,
          direction: "debit",
          classification: "ignored"
        })
      ]
    }),
    "2026-02",
    afterFebruary
  );

  assert.equal(assessment.expenseStatus, "ready");
  assert.equal(assessment.ignoredExpenseCount, 1);
  assert.equal(assessment.status, "ready_to_close");
});

test("unclassified debit and missing expense category block close readiness", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-07",
          amount: 1800,
          direction: "credit",
          classification: "rental_income"
        }),
        transaction({
          postedAt: "2026-02-10",
          amount: 125,
          direction: "debit",
          classification: null
        }),
        transaction({
          postedAt: "2026-02-12",
          amount: 80,
          direction: "debit",
          classification: "expense",
          category: null
        })
      ]
    }),
    "2026-02",
    afterFebruary
  );

  assert.equal(assessment.expenseStatus, "needs_review");
  assert.equal(assessment.unclassifiedExpenseCount, 1);
  assert.equal(assessment.missingExpenseCategoryCount, 1);
  assert.equal(assessment.status, "open");
});

test("saved closed review reports closed status", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      monthlyReviews: [
        monthlyReview({
          closedAt: "2026-03-01T12:00:00.000Z",
          reviewMonth: "2026-02-01"
        })
      ],
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-07",
          amount: 1800,
          direction: "credit",
          classification: "rental_income"
        })
      ]
    }),
    "2026-02",
    afterFebruary
  );

  assert.equal(assessment.status, "closed");
  assert.equal(assessment.closedAt, "2026-03-01T12:00:00.000Z");
});

test("ready data cannot close until the review month is complete", () => {
  const assessment = helpers.getMonthlyReviewAssessment(
    property({
      propertyTransactions: [
        transaction({
          postedAt: "2026-02-07",
          amount: 1800,
          direction: "credit",
          classification: "rental_income"
        })
      ]
    }),
    "2026-02",
    new Date("2026-02-15T12:00:00.000Z")
  );

  assert.equal(assessment.rentStatus, "ready");
  assert.equal(assessment.expenseStatus, "ready");
  assert.equal(assessment.isReviewMonthComplete, false);
  assert.equal(assessment.isReadyToClose, false);
  assert.equal(assessment.status, "open");
});

test("rent sync auto-records only same-month matching credits", () => {
  const decisions = syncHelpers.getMonthlyRentCreditSyncDecisions({
    expectedAmount: 1800,
    getClassification: () => null,
    minimumAmount: 10,
    reviewMonth: "2026-02-01",
    tolerance: 0,
    transactions: [
      bankTransaction({
        id: "january-rent",
        postedAt: "2026-01-30"
      }),
      bankTransaction({
        id: "february-rent",
        postedAt: "2026-02-05"
      }),
      bankTransaction({
        id: "march-rent",
        postedAt: "2026-03-02"
      })
    ]
  });
  const byId = new Map(
    decisions.map((decision) => [decision.transaction.id, decision])
  );

  assert.equal(
    byId.get("february-rent").shouldAutoRecordRentalIncome,
    true
  );
  assert.equal(byId.get("february-rent").shouldCreatePendingReview, false);
  assert.equal(
    byId.get("january-rent").shouldAutoRecordRentalIncome,
    false
  );
  assert.equal(byId.get("january-rent").shouldCreatePendingReview, true);
  assert.equal(byId.get("march-rent").shouldAutoRecordRentalIncome, false);
  assert.equal(byId.get("march-rent").shouldCreatePendingReview, true);
});

test("rent sync keeps existing ledger decisions instead of overwriting them", () => {
  const decisions = syncHelpers.getMonthlyRentCreditSyncDecisions({
    expectedAmount: 1800,
    getClassification: (transaction) =>
      transaction.id === "reviewed-rent"
        ? syncClassification({
            id: "reviewed-ledger-id",
            classification: "ignored"
          })
        : null,
    minimumAmount: 10,
    reviewMonth: "2026-02-01",
    tolerance: 0,
    transactions: [
      bankTransaction({
        id: "reviewed-rent",
        postedAt: "2026-02-05"
      })
    ]
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].classification.classification, "ignored");
  assert.equal(decisions[0].shouldAutoRecordRentalIncome, false);
  assert.equal(decisions[0].shouldCreatePendingReview, false);
});

test("expense sync creates pending review only for untracked debits", () => {
  const decisions = syncHelpers.getMonthlyExpenseDebitSyncDecisions({
    getClassification: (transaction) =>
      transaction.id === "classified-expense"
        ? syncClassification({
            id: "expense-ledger-id",
            classification: "expense"
          })
        : null,
    transactions: [
      bankTransaction({
        id: "new-expense",
        direction: "debit",
        amount: 125
      }),
      bankTransaction({
        id: "classified-expense",
        direction: "debit",
        amount: 80
      }),
      bankTransaction({
        id: "rent-credit",
        direction: "credit",
        amount: 1800
      })
    ]
  });
  const byId = new Map(
    decisions.map((decision) => [decision.transaction.id, decision])
  );

  assert.equal(decisions.length, 2);
  assert.equal(byId.get("new-expense").shouldCreatePendingReview, true);
  assert.equal(byId.get("new-expense").shouldShowAsUnclassified, true);
  assert.equal(byId.get("classified-expense").shouldCreatePendingReview, false);
  assert.equal(byId.get("classified-expense").shouldShowAsUnclassified, false);
});
