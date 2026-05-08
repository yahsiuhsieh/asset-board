import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadHistoryHelpers() {
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

  const source = await readFile(
    new URL("../lib/real-estate-history.ts", import.meta.url),
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
      filename: "real-estate-history.ts"
    }
  );

  return module.exports;
}

const helpers = await loadHistoryHelpers();

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshot(overrides) {
  return {
    id: "snapshot-id",
    assetId: "property-1",
    metricType: "current_market_value",
    value: 100,
    recordedAt: "2026-04-25",
    source: "manual",
    note: null,
    ...overrides
  };
}

test("value equity series uses current property mortgage for the latest point", () => {
  const points = helpers.getPropertyValueEquitySeries({
    currentDate: "2026-05-07",
    currentMarketValue: 632000,
    remainingMortgageBalance: 0,
    snapshots: [
      snapshot({
        metricType: "current_market_value",
        value: 520000,
        recordedAt: "2026-04-25"
      }),
      snapshot({
        metricType: "remaining_mortgage_balance",
        value: 302000,
        recordedAt: "2026-04-25"
      }),
      snapshot({
        metricType: "current_market_value",
        value: 632000,
        recordedAt: "2026-05-01",
        source: "provider"
      })
    ]
  });

  assert.deepEqual(toPlain(points.at(-1)), {
    date: "2026-05-07",
    currentMarketValue: 632000,
    remainingMortgageBalance: 0,
    equity: 632000
  });
});

test("value equity series still keeps historical mortgage snapshots", () => {
  const points = helpers.getPropertyValueEquitySeries({
    currentDate: "2026-05-07",
    currentMarketValue: 632000,
    remainingMortgageBalance: 0,
    snapshots: [
      snapshot({
        metricType: "current_market_value",
        value: 520000,
        recordedAt: "2026-04-25"
      }),
      snapshot({
        metricType: "remaining_mortgage_balance",
        value: 302000,
        recordedAt: "2026-04-25"
      })
    ]
  });

  assert.deepEqual(toPlain(points[0]), {
    date: "2026-04-25",
    currentMarketValue: 520000,
    remainingMortgageBalance: 302000,
    equity: 218000
  });
});

test("current-date point overrides same-day stale mortgage snapshots", () => {
  const points = helpers.getPropertyValueEquitySeries({
    currentDate: "2026-05-07",
    currentMarketValue: 632000,
    remainingMortgageBalance: 0,
    snapshots: [
      snapshot({
        metricType: "current_market_value",
        value: 632000,
        recordedAt: "2026-05-07"
      }),
      snapshot({
        metricType: "remaining_mortgage_balance",
        value: 302000,
        recordedAt: "2026-05-07"
      })
    ]
  });

  assert.deepEqual(toPlain(points), [
    {
      date: "2026-05-07",
      currentMarketValue: 632000,
      remainingMortgageBalance: 0,
      equity: 632000
    }
  ]);
});
