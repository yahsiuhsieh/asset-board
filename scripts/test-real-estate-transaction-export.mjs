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
const helpers = await loadTsModule("../lib/real-estate-transaction-export.ts", {
  "@/lib/real-estate-transaction-notes": transactionNoteHelpers
});

function transaction(overrides) {
  return {
    id: "transaction-id",
    assetId: "property-1",
    bankConnectionId: null,
    provider: "plaid",
    providerTransactionId: "provider-transaction-id",
    accountId: "account-id",
    accountName: "Operating Checking",
    postedAt: "2025-01-01",
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

function property(overrides) {
  return {
    id: "property-1",
    name: "Duplex A",
    address: "100 Main St",
    propertyTransactions: [],
    ...overrides
  };
}

test("builds annual export rows across properties", () => {
  const rows = helpers.getPortfolioAnnualExportRows(
    [
      property({
        id: "property-1",
        name: "Duplex A",
        address: "100 Main St",
        propertyTransactions: [
          transaction({
            id: "rent-2025",
            provider: "plaid",
            postedAt: "2025-01-05",
            rentPeriodMonth: "2026-02-01",
            description: "January rent",
            amount: 1800,
            classification: "rental_income"
          }),
          transaction({
            id: "ignored-2025",
            postedAt: "2025-01-06",
            classification: "ignored"
          }),
          transaction({
            id: "unclassified-2025",
            postedAt: "2025-01-07",
            classification: null
          }),
          transaction({
            id: "rent-2024",
            postedAt: "2024-12-05",
            classification: "rental_income"
          })
        ]
      }),
      property({
        id: "property-2",
        name: "Condo B",
        address: "200 Oak Ave",
        propertyTransactions: [
          transaction({
            id: "expense-2025",
            postedAt: "2025-01-03",
            description: "Plumbing repair",
            amount: 250,
            direction: "debit",
            classification: "expense",
            category: "maintenance"
          })
        ]
      })
    ],
    "2025"
  );

  assert.deepEqual(
    rows.map((row) => ({
      date: row.date,
      type: row.type,
      propertyName: row.propertyName,
      amount: row.amount
    })),
    [
      {
        date: "2025-01-03",
        type: "expense",
        propertyName: "Condo B",
        amount: 250
      },
      {
        date: "2025-01-05",
        type: "rental_income",
        propertyName: "Duplex A",
        amount: 1800
      }
    ]
  );
});

test("lists years and defaults to current year when available", () => {
  const properties = [
    property({
      propertyTransactions: [
        transaction({ postedAt: "2024-05-01" }),
        transaction({ postedAt: "2026-05-01" }),
        transaction({ postedAt: "2025-05-01", classification: "ignored" })
      ]
    })
  ];

  assert.deepEqual(Array.from(helpers.getPortfolioAnnualExportYears(properties)), [
    "2026",
    "2024"
  ]);
  assert.equal(
    helpers.getDefaultPortfolioAnnualExportYear(["2026", "2024"], "2026"),
    "2026"
  );
  assert.equal(
    helpers.getDefaultPortfolioAnnualExportYear(["2025", "2024"], "2026"),
    "2025"
  );
});

test("exports blank notes for placeholder transaction notes", () => {
  const rows = helpers.getPortfolioAnnualExportRows(
    [
      property({
        propertyTransactions: [
          transaction({
            postedAt: "2026-02-10",
            description: "Plumbing repair",
            amount: 150,
            direction: "debit",
            classification: "expense",
            category: "maintenance",
            note: "Marked as expense."
          }),
          transaction({
            postedAt: "2026-02-11",
            description: "Rule matched utility",
            amount: 90,
            direction: "debit",
            classification: "expense",
            category: "utilities",
            note: "Classified by rule: Utilities"
          })
        ]
      })
    ],
    "2026"
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].note, "");
  assert.equal(rows[1].note, "");
});
