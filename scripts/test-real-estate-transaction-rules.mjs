import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadTransactionRuleHelpers() {
  const source = await readFile(
    new URL("../lib/real-estate-transaction-rules.ts", import.meta.url),
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
      filename: "real-estate-transaction-rules.ts"
    }
  );

  return module.exports;
}

const helpers = await loadTransactionRuleHelpers();

function rule(overrides) {
  return {
    id: "rule-id",
    assignedAssetId: "property-1",
    name: "Sunstrong utilities",
    containsText: "SUNSTRONG",
    targetAmount: 82.88,
    setTransactionName: null,
    category: "utilities",
    isActive: true,
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
    ...overrides
  };
}

function transaction(overrides) {
  return {
    amount: 82.88,
    description: "SUNSTRONG FIN ACCT PAYMT 1394698000 WEB ID: 8518154151",
    direction: "debit",
    ...overrides
  };
}

test("transaction rule matches description case-insensitively", () => {
  assert.equal(
    helpers.transactionMatchesRule(
      rule({ containsText: "sunstrong" }),
      transaction({
        description: "SUNSTRONG FIN ACCT PAYMT 1394698000 WEB ID: 8518154151"
      })
    ),
    true
  );
});

test("transaction rule requires an exact cents amount match", () => {
  assert.equal(
    helpers.transactionMatchesRule(
      rule({ targetAmount: 82.88 }),
      transaction({ amount: 82.88 })
    ),
    true
  );
  assert.equal(
    helpers.transactionMatchesRule(
      rule({ targetAmount: 82.88 }),
      transaction({ amount: 82.89 })
    ),
    false
  );
});

test("assigned property does not scope transaction rule matching", () => {
  assert.equal(
    helpers.transactionMatchesRule(
      rule({ assignedAssetId: "property-1" }),
      transaction({})
    ),
    true
  );
  assert.equal(
    helpers.transactionMatchesRule(
      rule({ assignedAssetId: "property-2" }),
      transaction({})
    ),
    true
  );
});

test("inactive transaction rule does not match", () => {
  assert.equal(
    helpers.transactionMatchesRule(rule({ isActive: false }), transaction({})),
    false
  );
});

test("first matching transaction rule wins", () => {
  const match = helpers.findMatchingTransactionRule(
    [
      rule({ id: "first-rule", name: "First rule", category: "utilities" }),
      rule({ id: "second-rule", name: "Second rule", category: "hoa" })
    ],
    transaction({})
  );

  assert.equal(match.id, "first-rule");
  const classification = helpers.getTransactionRuleClassification(match);

  assert.equal(classification.category, "utilities");
  assert.equal(classification.classification, "expense");
  assert.equal(classification.assignedAssetId, "property-1");
  assert.equal(classification.note, null);
  assert.equal(classification.ruleId, "first-rule");
  assert.equal(classification.ruleName, "First rule");
  assert.equal(classification.transactionName, null);
});

test("transaction rule classification can rename transactions", () => {
  const classification = helpers.getTransactionRuleClassification(
    rule({ setTransactionName: "Sunstrong Utilities" })
  );

  assert.equal(classification.transactionName, "Sunstrong Utilities");
});
