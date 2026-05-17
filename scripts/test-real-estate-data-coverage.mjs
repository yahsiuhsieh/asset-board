import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireModule = createRequire(import.meta.url);
const react = requireModule("react");
const jsxRuntime = requireModule("react/jsx-runtime");
const reactDomServer = requireModule("react-dom/server");

async function loadDataCoverageHelpers() {
  const monthlyReviewSource = await readFile(
    new URL("../lib/real-estate-monthly-review.ts", import.meta.url),
    "utf8"
  );
  const { outputText: monthlyReviewOutput } = ts.transpileModule(
    monthlyReviewSource,
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020
      }
    }
  );
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

  const source = await readFile(
    new URL("../lib/real-estate-data-coverage.ts", import.meta.url),
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

        throw new Error(`Unexpected require: ${specifier}`);
      }
    },
    {
      filename: "real-estate-data-coverage.ts"
    }
  );

  return module.exports;
}

async function loadMonthlyReviewWorkspace(dataCoverageHelpers) {
  const source = await readFile(
    new URL("../components/real-estate/MonthlyReviewWorkspace.tsx", import.meta.url),
    "utf8"
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  const Icon = () => jsxRuntime.jsx("svg", {});

  vm.runInNewContext(
    outputText,
    {
      exports: module.exports,
      module,
      require: (specifier) => {
        if (specifier === "react") {
          return react;
        }

        if (specifier === "react/jsx-runtime") {
          return jsxRuntime;
        }

        if (specifier === "react-dom") {
          return {
            useFormStatus: () => ({ pending: false })
          };
        }

        if (specifier === "next/navigation") {
          return {
            useRouter: () => ({ refresh: () => {} })
          };
        }

        if (specifier === "lucide-react") {
          return {
            CheckCircle2: Icon,
            CircleAlert: Icon,
            Lock: Icon,
            RotateCcw: Icon
          };
        }

        if (specifier === "@/app/actions/real-estate") {
          return {
            closeMonthlyReview: () => {},
            reopenMonthlyReview: () => {}
          };
        }

        if (specifier === "@/components/ui/button") {
          return {
            Button: ({ children, disabled, type }) =>
              jsxRuntime.jsx("button", {
                disabled,
                type,
                children
              })
          };
        }

        if (specifier === "@/components/ui/card") {
          const Passthrough = ({ children }) => jsxRuntime.jsx("div", { children });

          return {
            Card: Passthrough,
            CardContent: Passthrough,
            CardHeader: Passthrough,
            CardTitle: Passthrough
          };
        }

        if (specifier === "@/lib/real-estate-data-coverage") {
          return dataCoverageHelpers;
        }

        if (specifier === "@/lib/real-estate-expenses") {
          return {
            getCurrentMonth: () => "2026-01"
          };
        }

        if (specifier === "@/lib/real-estate-monthly-review") {
          return {
            getMonthlyReviewAssessment: () => {
              throw new Error("MonthlyReviewWorkspace should not render in this test");
            }
          };
        }

        if (specifier === "@/lib/utils") {
          return {
            cn: (...values) => values.flat().filter(Boolean).join(" ")
          };
        }

        if (
          specifier === "./ExpenseTransactionManager" ||
          specifier === "./RentCollectionManager" ||
          specifier === "./RentTransactionMatchPreview"
        ) {
          return {
            ExpenseTransactionManager: () => null,
            RentCollectionManager: () => null,
            RentTransactionMatchPreview: () => null
          };
        }

        throw new Error(`Unexpected require: ${specifier}`);
      }
    },
    {
      filename: "MonthlyReviewWorkspace.tsx"
    }
  );

  return module.exports;
}

async function loadDataCoverageBadge() {
  const source = await readFile(
    new URL("../components/real-estate/DataCoverageBadge.tsx", import.meta.url),
    "utf8"
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
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
        if (specifier === "react/jsx-runtime") {
          return jsxRuntime;
        }

        if (specifier === "@/lib/utils") {
          return {
            cn: (...values) => values.flat().filter(Boolean).join(" ")
          };
        }

        throw new Error(`Unexpected require: ${specifier}`);
      }
    },
    {
      filename: "DataCoverageBadge.tsx"
    }
  );

  return module.exports;
}

const helpers = await loadDataCoverageHelpers();
const monthlyReviewWorkspace = await loadMonthlyReviewWorkspace(helpers);
const dataCoverageBadge = await loadDataCoverageBadge();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function textContent(html) {
  return html.replace(/<[^>]*>/g, "");
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

function property(overrides = {}) {
  return {
    bankConnections: [],
    id: "property-1",
    monthlyReviews: [],
    purchasedAt: "2026-01-01",
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
    closedAt: "2026-02-01T12:00:00.000Z",
    note: null,
    ...overrides
  };
}

function monthlyAssessment(overrides = {}) {
  return {
    closedAt: null,
    expenseStatus: "ready",
    ignoredExpenseCount: 0,
    isReadyToClose: true,
    isReviewMonthComplete: true,
    missingExpenseCategoryCount: 0,
    note: null,
    recordedExpenseCount: 0,
    recordedExpenses: 0,
    rentCollected: 0,
    rentStatus: "ready",
    reviewMonth: "2026-01",
    reviewMonthDate: "2026-01-01",
    status: "ready_to_close",
    targetRent: 0,
    unclassifiedExpenseCount: 0,
    unclassifiedRentCreditCount: 0,
    ...overrides
  };
}

function renderMonthlyReviewStatus({
  assessment = monthlyAssessment(),
  property: propertyValue = property(),
  reviewMonth = "2026-01",
  today
} = {}) {
  return reactDomServer.renderToStaticMarkup(
    jsxRuntime.jsx(monthlyReviewWorkspace.MonthlyReviewStatusPanel, {
      assessment,
      closeAction: "/close",
      closeState: {
        message: "",
        status: "idle"
      },
      property: propertyValue,
      reopenAction: "/reopen",
      reopenState: {
        message: "",
        status: "idle"
      },
      reviewMonth,
      today
    })
  );
}

test("complete month coverage requires raw sync through the full month", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [bankConnection()]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(assessment.status, "complete");
  assert.equal(assessment.accounts[0].status, "complete");
});

test("partial raw sync range needs sync for a completed month", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(assessment.status, "needs_sync");
  assert.equal(assessment.accounts[0].status, "needs_sync");
});

test("range display shows only the missing trailing range for partial coverage", () => {
  const display = helpers.getDataCoverageRangeDisplay({
    account: {
      syncedEndDate: "2026-01-15",
      syncedStartDate: "2026-01-01"
    },
    endDate: "2026-01-31",
    startDate: "2026-01-01"
  });

  assert.equal(display.hasSyncedCoverage, true);
  assert.equal(display.isFullyCovered, false);
  assert.deepEqual(plain(display.missingRanges), [
    {
      endDate: "2026-01-31",
      startDate: "2026-01-16"
    }
  ]);
  assert.equal(display.syncedStartPercent, 0);
  assert.equal(display.syncedWidthPercent, (15 / 31) * 100);
});

test("range display shows full coverage without missing ranges", () => {
  const display = helpers.getDataCoverageRangeDisplay({
    account: {
      syncedEndDate: "2026-01-31",
      syncedStartDate: "2026-01-01"
    },
    endDate: "2026-01-31",
    startDate: "2026-01-01"
  });

  assert.equal(display.hasSyncedCoverage, true);
  assert.equal(display.isFullyCovered, true);
  assert.deepEqual(plain(display.missingRanges), []);
  assert.equal(display.syncedStartPercent, 0);
  assert.equal(display.syncedWidthPercent, 100);
});

test("range display shows the full month missing when no sync range exists", () => {
  const display = helpers.getDataCoverageRangeDisplay({
    account: {
      syncedEndDate: null,
      syncedStartDate: null
    },
    endDate: "2026-01-31",
    startDate: "2026-01-01"
  });

  assert.equal(display.hasSyncedCoverage, false);
  assert.equal(display.isFullyCovered, false);
  assert.deepEqual(plain(display.missingRanges), [
    {
      endDate: "2026-01-31",
      startDate: "2026-01-01"
    }
  ]);
  assert.equal(display.syncedStartPercent, 0);
  assert.equal(display.syncedWidthPercent, 0);
});

test("completed partial coverage renders the missing range in close status", () => {
  const html = renderMonthlyReviewStatus({
    property: property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ]
    })
  });
  const text = textContent(html);

  assert.match(text, /Close Status/);
  assert.match(text, /Bank Coverage: Needs review/);
  assert.match(text, /15\/31 days/);
  assert.match(text, /Missing Jan 16-Jan 31/);
  assert.match(html, /aria-label="Missing Jan 16-Jan 31"/);
  assert.match(text, /Open/);
  assert.doesNotMatch(text, /Synced Jan 1-Jan 15/);
});

test("open month bank coverage uses a visual bar without extra copy", () => {
  const html = renderMonthlyReviewStatus({
    assessment: monthlyAssessment({
      isReadyToClose: false,
      isReviewMonthComplete: false,
      reviewMonth: "2026-05",
      reviewMonthDate: "2026-05-01",
      status: "open"
    }),
    property: property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-05-31",
          rawTransactionsSyncedStartDate: "2026-05-01"
        })
      ]
    }),
    reviewMonth: "2026-05",
    today: new Date("2026-05-17T12:00:00.000Z")
  });
  const text = textContent(html);

  assert.match(text, /Bank Coverage/);
  assert.match(text, /17\/31 days/);
  assert.match(html, /aria-label="Bank coverage is accumulating for this open month"/);
  assert.match(html, /width:54\.83870967741935%/);
  assert.doesNotMatch(html, /width:100%/);
  assert.doesNotMatch(text, /31\/31 days/);
  assert.doesNotMatch(text, /Open through May 31/);
  assert.doesNotMatch(text, /Bank Coverage: In progress/);
  assert.doesNotMatch(text, /Missing May/);
  assert.doesNotMatch(text, /Operating Checking/);
  assert.doesNotMatch(text, /Period/);
});

test("completed full coverage renders a full month covered bar", () => {
  const html = renderMonthlyReviewStatus({
    property: property({
      bankConnections: [bankConnection()]
    })
  });
  const text = textContent(html);

  assert.match(text, /Bank Coverage: Ready/);
  assert.match(text, /31\/31 days/);
  assert.match(text, /Full month covered/);
  assert.match(html, /aria-label="Full month covered"/);
  assert.doesNotMatch(text, /Period/);
});

test("closed accepted data coverage badge is hidden from customer UI", () => {
  const html = reactDomServer.renderToStaticMarkup(
    jsxRuntime.jsx(dataCoverageBadge.DataCoverageBadge, {
      status: "closed_accepted"
    })
  );

  assert.equal(html, "");
  assert.equal(
    dataCoverageBadge.getDataCoverageStatusLabel("closed_accepted"),
    ""
  );
});

test("closed month close status does not render bank coverage gap UI", () => {
  const html = renderMonthlyReviewStatus({
    assessment: monthlyAssessment({
      closedAt: "2026-02-01T12:00:00.000Z",
      status: "closed"
    }),
    property: property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ],
      monthlyReviews: [monthlyReview("2026-01")]
    })
  });
  const text = textContent(html);

  assert.match(text, /Close Status/);
  assert.match(text, /Closed/);
  assert.doesNotMatch(text, /accepted/i);
  assert.doesNotMatch(text, /Bank Coverage/);
  assert.doesNotMatch(text, /Operating Checking/);
  assert.doesNotMatch(text, /Missing Jan/);
  assert.doesNotMatch(text, /Full month covered/);
});

test("no bank coverage close status is informational", () => {
  const html = renderMonthlyReviewStatus({
    property: property()
  });
  const text = textContent(html);

  assert.match(text, /Bank Coverage: No bank/);
  assert.match(text, /No bank coverage/);
  assert.match(text, /Ready to close/);
  assert.doesNotMatch(text, /Needs review/);
  assert.doesNotMatch(text, /Missing Jan/);
  assert.doesNotMatch(text, /\/31 days/);
  assert.doesNotMatch(html, /aria-label="Full month covered"/);
  assert.doesNotMatch(html, /aria-label="Bank coverage is accumulating/);
});

test("open month reconnect shows reconnect copy without a coverage bar", () => {
  const html = renderMonthlyReviewStatus({
    assessment: monthlyAssessment({
      isReadyToClose: false,
      isReviewMonthComplete: false,
      reviewMonth: "2099-05",
      reviewMonthDate: "2099-05-01",
      status: "open"
    }),
    property: property({
      bankConnections: [
        bankConnection({
          status: "disconnected"
        })
      ]
    }),
    reviewMonth: "2099-05"
  });
  const text = textContent(html);

  assert.match(text, /Bank Coverage: Needs review/);
  assert.match(text, /Needs reconnect/);
  assert.match(text, /Reconnect account to check coverage/);
  assert.match(text, /Open/);
  assert.doesNotMatch(text, /Missing May/);
  assert.doesNotMatch(text, /\/31 days/);
  assert.doesNotMatch(html, /aria-label="Missing/);
  assert.doesNotMatch(html, /aria-label="Bank coverage is accumulating/);
});

test("disconnected account needs reconnect", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [
        bankConnection({
          status: "disconnected"
        })
      ]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(assessment.status, "needs_reconnect");
  assert.equal(assessment.accounts[0].status, "needs_reconnect");
});

test("property with no linked bank account is informational only", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property(),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(assessment.status, "no_bank_coverage");
  assert.equal(assessment.accounts.length, 0);
});

test("current in-progress month is not treated as missing sync", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-05-10"
        })
      ]
    }),
    "2026-05",
    new Date("2026-05-16T12:00:00.000Z")
  );

  assert.equal(assessment.status, "in_progress");
  assert.equal(assessment.accounts[0].status, "in_progress");
});

test("closed month with incomplete raw sync is accepted for reporting", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ],
      monthlyReviews: [monthlyReview("2026-01")]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(assessment.status, "closed_accepted");
  assert.equal(assessment.accounts[0].status, "closed_accepted");
  assert.equal(
    helpers.isMonthlyDataCoverageCloseBlocked(assessment),
    false
  );
});

test("closed month with no linked bank account remains non-blocking", () => {
  const assessment = helpers.getMonthlyDataCoverageAssessment(
    property({
      monthlyReviews: [monthlyReview("2026-01")]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(assessment.status, "closed_accepted");
  assert.equal(
    helpers.isMonthlyDataCoverageCloseBlocked(assessment),
    false
  );
});

test("close blocking follows bank coverage status", () => {
  const complete = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [bankConnection()]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );
  const noBankCoverage = helpers.getMonthlyDataCoverageAssessment(
    property(),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );
  const incomplete = helpers.getMonthlyDataCoverageAssessment(
    property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ]
    }),
    "2026-01",
    new Date("2026-02-01T12:00:00.000Z")
  );

  assert.equal(helpers.isMonthlyDataCoverageCloseBlocked(complete), false);
  assert.equal(helpers.isMonthlyDataCoverageCloseBlocked(noBankCoverage), false);
  assert.equal(helpers.isMonthlyDataCoverageCloseBlocked(incomplete), true);
});

test("annual coverage issues ignore properties without linked bank accounts", () => {
  const issues = helpers.getPropertyAnnualDataCoverageIssues({
    property: property({
      purchasedAt: "2026-01-01"
    }),
    today: new Date("2026-03-01T12:00:00.000Z"),
    year: "2026"
  });

  assert.equal(issues.length, 0);
});

test("annual coverage issues ignore closed months with missing sync metadata", () => {
  const issues = helpers.getPropertyAnnualDataCoverageIssues({
    property: property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ],
      monthlyReviews: [monthlyReview("2026-01")],
      purchasedAt: "2026-01-01"
    }),
    today: new Date("2026-02-01T12:00:00.000Z"),
    year: "2026"
  });

  assert.equal(issues.length, 0);
});

test("annual coverage issues include completed months with missing sync", () => {
  const issues = helpers.getPropertyAnnualDataCoverageIssues({
    property: property({
      bankConnections: [
        bankConnection({
          rawTransactionsSyncedEndDate: "2026-01-15"
        })
      ],
      purchasedAt: "2026-01-01"
    }),
    today: new Date("2026-02-01T12:00:00.000Z"),
    year: "2026"
  });

  assert.deepEqual(
    Array.from(issues, (assessment) => assessment.reviewMonth),
    ["2026-01"]
  );
});
