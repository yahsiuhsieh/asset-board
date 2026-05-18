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
const helpers = await loadTsModule("../lib/real-estate-annual-statement.ts", {
  "@/lib/real-estate-transaction-notes": transactionNoteHelpers
});
const today = new Date("2026-04-30T12:00:00.000Z");

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

function property(overrides) {
  return {
    id: "property-1",
    name: "Duplex A",
    address: "100 Main St",
    rentalStatus: "rented",
    purchasedAt: "2026-01-01",
    monthlyMortgage: 1000,
    propertyTransactions: [],
    ...overrides
  };
}

function qualityResult(overrides) {
  return {
    propertyId: "property-1",
    blockingIssues: [],
    warningIssues: [],
    ...overrides
  };
}

function getNumericStatementFields(row) {
  return {
    rentCollected: row.rentCollected,
    taxes: row.taxes,
    insurance: row.insurance,
    maintenance: row.maintenance,
    hoa: row.hoa,
    utilities: row.utilities,
    other: row.other,
    totalOperatingExpenses: row.totalOperatingExpenses,
    noi: row.noi,
    scheduledDebtService: row.scheduledDebtService,
    cashFlowAfterDebtService: row.cashFlowAfterDebtService,
    blockingIssueCount: row.blockingIssueCount,
    warningIssueCount: row.warningIssueCount
  };
}

test("builds multi-property annual statement rows and portfolio totals", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        id: "property-1",
        name: "Duplex A",
        address: "100 Main St",
        rentalStatus: "rented",
        purchasedAt: "2026-02-10",
        monthlyMortgage: 1000,
        propertyTransactions: [
          transaction({
            id: "rent-feb",
            postedAt: "2026-02-05",
            amount: 1800,
            direction: "credit",
            classification: "rental_income"
          }),
          transaction({
            id: "rent-mar",
            postedAt: "2026-03-05",
            amount: 1800,
            direction: "credit",
            classification: "rental_income"
          }),
          transaction({
            id: "taxes",
            postedAt: "2026-02-15",
            amount: 400,
            direction: "debit",
            classification: "expense",
            category: "taxes"
          }),
          transaction({
            id: "maintenance",
            postedAt: "2026-03-20",
            amount: 100,
            direction: "debit",
            classification: "expense",
            category: "maintenance"
          }),
          transaction({
            id: "ignored",
            postedAt: "2026-03-21",
            amount: 999,
            direction: "debit",
            classification: "ignored",
            category: null
          }),
          transaction({
            id: "unclassified",
            postedAt: "2026-03-22",
            amount: 888,
            direction: "debit",
            classification: null,
            category: null
          })
        ]
      }),
      property({
        id: "property-2",
        name: "Condo B",
        address: "200 Oak Ave",
        rentalStatus: "vacant",
        purchasedAt: null,
        monthlyMortgage: 500,
        propertyTransactions: [
          transaction({
            id: "rent-jan",
            postedAt: "2026-01-06",
            amount: 1200,
            direction: "credit",
            classification: "rental_income"
          }),
          transaction({
            id: "insurance",
            postedAt: "2026-02-12",
            amount: 200,
            direction: "debit",
            classification: "expense",
            category: "insurance"
          }),
          transaction({
            id: "utilities",
            postedAt: "2026-03-12",
            amount: 50,
            direction: "debit",
            classification: "expense",
            category: "utilities"
          })
        ]
      })
    ],
    "2026",
    [
      qualityResult({
        propertyId: "property-1",
        blockingIssues: [{ id: "blocking-1" }, { id: "blocking-2" }],
        warningIssues: [{ id: "warning-1" }]
      }),
      qualityResult({
        propertyId: "property-2",
        blockingIssues: [],
        warningIssues: [{ id: "warning-2" }, { id: "warning-3" }]
      })
    ],
    today
  );

  assert.equal(statement.propertyRows.length, 2);
  assert.deepEqual(getNumericStatementFields(statement.propertyRows[0]), {
    rentCollected: 3600,
    taxes: 400,
    insurance: 0,
    maintenance: 100,
    hoa: 0,
    utilities: 0,
    other: 0,
    totalOperatingExpenses: 500,
    noi: 3100,
    scheduledDebtService: 3000,
    cashFlowAfterDebtService: 100,
    blockingIssueCount: 2,
    warningIssueCount: 1
  });
  assert.deepEqual(getNumericStatementFields(statement.propertyRows[1]), {
    rentCollected: 1200,
    taxes: 0,
    insurance: 200,
    maintenance: 0,
    hoa: 0,
    utilities: 50,
    other: 0,
    totalOperatingExpenses: 250,
    noi: 950,
    scheduledDebtService: 2000,
    cashFlowAfterDebtService: -1050,
    blockingIssueCount: 0,
    warningIssueCount: 2
  });
  assert.deepEqual(getNumericStatementFields(statement.totalRow), {
    rentCollected: 4800,
    taxes: 400,
    insurance: 200,
    maintenance: 100,
    hoa: 0,
    utilities: 50,
    other: 0,
    totalOperatingExpenses: 750,
    noi: 4050,
    scheduledDebtService: 5000,
    cashFlowAfterDebtService: -950,
    blockingIssueCount: 2,
    warningIssueCount: 3
  });
  assert.equal(statement.totalRow.expenseRatio, 750 / 4800);
});

test("scheduled debt service uses current year elapsed months only", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        purchasedAt: null,
        monthlyMortgage: 100,
        propertyTransactions: []
      })
    ],
    "2026",
    [],
    today
  );

  assert.equal(statement.propertyRows[0].scheduledDebtService, 400);
});

test("scheduled debt service excludes months before purchase date", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        purchasedAt: "2025-06-15",
        monthlyMortgage: 100,
        propertyTransactions: []
      })
    ],
    "2025",
    [],
    today
  );

  assert.equal(statement.propertyRows[0].scheduledDebtService, 700);
});

test("future year scheduled debt service is zero", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        purchasedAt: null,
        monthlyMortgage: 100,
        propertyTransactions: []
      })
    ],
    "2027",
    [],
    today
  );

  assert.equal(statement.propertyRows[0].scheduledDebtService, 0);
});

test("vacant and rented statuses do not alter actual statement totals", () => {
  const rented = helpers.getPortfolioAnnualStatement(
    [
      property({
        rentalStatus: "rented",
        propertyTransactions: [
          transaction({ amount: 1000, classification: "rental_income" })
        ]
      })
    ],
    "2026",
    [],
    today
  );
  const vacant = helpers.getPortfolioAnnualStatement(
    [
      property({
        rentalStatus: "vacant",
        propertyTransactions: [
          transaction({ amount: 1000, classification: "rental_income" })
        ]
      })
    ],
    "2026",
    [],
    today
  );

  assert.equal(rented.propertyRows[0].rentCollected, vacant.propertyRows[0].rentCollected);
  assert.equal(rented.propertyRows[0].noi, vacant.propertyRows[0].noi);
});

test("portfolio total row equals the sum of property rows", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        id: "property-1",
        propertyTransactions: [
          transaction({ amount: 1000, classification: "rental_income" }),
          transaction({
            amount: 300,
            direction: "debit",
            classification: "expense",
            category: "other"
          })
        ]
      }),
      property({
        id: "property-2",
        propertyTransactions: [
          transaction({ amount: 2000, classification: "rental_income" }),
          transaction({
            amount: 400,
            direction: "debit",
            classification: "expense",
            category: "hoa"
          })
        ]
      })
    ],
    "2026",
    [],
    today
  );

  for (const field of [
    "rentCollected",
    "taxes",
    "insurance",
    "maintenance",
    "hoa",
    "utilities",
    "other",
    "totalOperatingExpenses",
    "noi",
    "scheduledDebtService",
    "cashFlowAfterDebtService"
  ]) {
    assert.equal(
      statement.totalRow[field],
      statement.propertyRows.reduce((total, row) => total + row[field], 0),
      field
    );
  }
});

test("zero rent expense ratio is null and serializes as blank", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        propertyTransactions: [
          transaction({
            amount: 300,
            direction: "debit",
            classification: "expense",
            category: "maintenance"
          })
        ]
      })
    ],
    "2026",
    [],
    today
  );
  const csv = helpers.serializePortfolioAnnualStatementCsv(statement);

  assert.equal(statement.propertyRows[0].expenseRatio, null);
  assert.match(csv, /300\.00,-300\.00,4000\.00,-4300\.00,,0,0\r\n$/);
});

test("serializes annual statement CSV with escaping", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        name: 'Duplex "A"',
        address: "100 Main St, Unit 2\nFloor 1",
        propertyTransactions: [
          transaction({
            amount: 1000,
            direction: "credit",
            classification: "rental_income"
          })
        ]
      })
    ],
    "2026",
    [qualityResult({ warningIssues: [{ id: "warning" }] })],
    today
  );
  const csv = helpers.serializePortfolioAnnualStatementCsv(statement);

  assert.ok(
    csv.includes(
      '"Duplex ""A""","100 Main St, Unit 2\nFloor 1",rented,1000.00'
    )
  );
  assert.ok(csv.startsWith("property name,property address,rental status"));
});

test("serializes annual report CSV with summary sections and transaction appendix", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        name: "Duplex A",
        address: "100 Main St",
        propertyTransactions: [
          transaction({
            postedAt: "2026-01-05",
            rentPeriodMonth: "2026-02-01",
            description: "January rent",
            amount: 1800,
            direction: "credit",
            classification: "rental_income"
          }),
          transaction({
            postedAt: "2026-01-15",
            description: "Plumbing repair",
            amount: 250,
            direction: "debit",
            classification: "expense",
            category: "maintenance"
          })
        ]
      })
    ],
    "2026",
    [],
    today
  );
  const csv = helpers.serializePortfolioAnnualReportCsv(statement, [
    {
      date: "2026-01-05",
      type: "rental_income",
      category: "",
      description: "January rent",
      note: "Tenant paid early",
      account: "Operating Checking",
      amount: 1800,
      propertyName: "Duplex A",
      propertyAddress: "100 Main St"
    },
    {
      date: "2026-01-15",
      type: "expense",
      category: "maintenance",
      description: "Plumbing repair",
      note: "Reimbursed by owner reserve",
      account: "Operating Checking",
      amount: 250,
      propertyName: "Duplex A",
      propertyAddress: "100 Main St"
    }
  ]);

  assert.ok(
    csv.startsWith(
      ",,,,,,,,,,,,,,,,\r\nPortfolio Summary,,,,,,,,,,,,,,,,\r\n,rent collected,taxes,insurance"
    )
  );
  assert.ok(
    csv.includes(
      "\r\n,,,,,,,,,,,,,,,,\r\nProperty Summary,,,,,,,,,,,,,,,,\r\n,property address,rental status"
    )
  );
  assert.ok(
    csv.includes(
      "\r\n,,,,,,,,,,,,,,,,\r\nTransaction Appendix,,,,,,,,,,,,,,,,\r\ndate,type,category,description,note,account,amount,property name,property address,,,,,,,,"
    )
  );
  assert.ok(
    csv.includes(
      "\r\n2026-01-05,rental_income,,January rent,Tenant paid early,Operating Checking,1800.00,Duplex A,100 Main St,,,,,,,,\r\n"
    )
  );
  assert.ok(
    csv.includes(
      "\r\n2026-01-15,expense,maintenance,Plumbing repair,Reimbursed by owner reserve,Operating Checking,250.00,Duplex A,100 Main St,,,,,,,,\r\n"
    )
  );
  assert.ok(csv.includes("\r\ntotal,1800.00,0.00,0.00,250.00"));
  assert.deepEqual(
    csv
      .trimEnd()
      .split("\r\n")
      .map((row) => row.split(",").length),
    Array(13).fill(17)
  );
});

test("serializes annual report CSV with escaping across sections", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        name: 'Duplex "A"',
        address: "100 Main St, Unit 2\nFloor 1",
        propertyTransactions: [
          transaction({
            amount: 1000,
            direction: "credit",
            classification: "rental_income"
          })
        ]
      })
    ],
    "2026",
    [],
    today
  );
  const csv = helpers.serializePortfolioAnnualReportCsv(statement, [
    {
      date: "2026-03-12",
      type: "expense",
      category: "maintenance",
      description: 'AC "repair", urgent\nsame day',
      note: 'Vendor said "rush", tenant approved',
      account: "Checking, main",
      amount: 125.5,
      propertyName: 'Duplex "A"',
      propertyAddress: "100 Main St, Unit 2\nFloor 1"
    }
  ]);

  assert.ok(
    csv.includes(
      '"Duplex ""A""","100 Main St, Unit 2\nFloor 1",rented,1000.00'
    )
  );
  assert.ok(
    csv.includes(
      '2026-03-12,expense,maintenance,"AC ""repair"", urgent\nsame day","Vendor said ""rush"", tenant approved","Checking, main",125.50,"Duplex ""A""","100 Main St, Unit 2\nFloor 1"'
    )
  );
});

test("annual report preserves transaction cents in summaries and appendix", () => {
  const statement = helpers.getPortfolioAnnualStatement(
    [
      property({
        name: "Duplex A",
        address: "100 Main St",
        propertyTransactions: [
          transaction({
            amount: 1200.75,
            direction: "credit",
            classification: "rental_income"
          }),
          transaction({
            amount: 82.88,
            direction: "debit",
            classification: "expense",
            category: "utilities"
          })
        ]
      })
    ],
    "2026",
    [],
    today
  );
  const csv = helpers.serializePortfolioAnnualReportCsv(statement, [
    {
      date: "2026-05-05",
      type: "expense",
      category: "utilities",
      description: "Utility bill",
      note: "Marked as expense.",
      account: "Chase Checking",
      amount: 82.88,
      propertyName: "Duplex A",
      propertyAddress: "100 Main St"
    }
  ]);

  assert.equal(statement.propertyRows[0].rentCollected, 1200.75);
  assert.equal(statement.propertyRows[0].utilities, 82.88);
  assert.equal(statement.propertyRows[0].noi, 1117.87);
  assert.ok(csv.includes("total,1200.75,0.00,0.00,0.00,0.00,82.88"));
  assert.ok(
    csv.includes(
      "\r\n2026-05-05,expense,utilities,Utility bill,,Chase Checking,82.88,Duplex A,100 Main St"
    )
  );
});

test("uses the portfolio annual report filename", () => {
  assert.equal(
    helpers.getPortfolioAnnualReportFilename("2026"),
    "assetboard-real-estate-2026-annual-report.csv"
  );
});
