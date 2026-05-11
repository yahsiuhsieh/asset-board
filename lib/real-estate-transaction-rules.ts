import type {
  RealEstateExpenseCategory,
  RealEstateTransactionRule
} from "@/types/wealth";

export interface TransactionRuleMatchInput {
  amount: number;
  description: string;
  direction: "credit" | "debit";
}

export interface TransactionRuleClassification {
  assignedAssetId: string | null;
  category: RealEstateExpenseCategory;
  classification: "expense";
  note: null;
  ruleId: string;
  ruleName: string;
  transactionName: string | null;
}

function normalizeRuleText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

export function transactionMatchesRule(
  rule: RealEstateTransactionRule,
  transaction: TransactionRuleMatchInput
): boolean {
  if (!rule.isActive || transaction.direction !== "debit") {
    return false;
  }

  const containsText = normalizeRuleText(rule.containsText);

  if (!containsText) {
    return false;
  }

  return (
    normalizeRuleText(transaction.description).includes(containsText) &&
    toCents(transaction.amount) === toCents(rule.targetAmount)
  );
}

export function findMatchingTransactionRule(
  rules: RealEstateTransactionRule[],
  transaction: TransactionRuleMatchInput
): RealEstateTransactionRule | null {
  return rules.find((rule) => transactionMatchesRule(rule, transaction)) ?? null;
}

export function getTransactionRuleClassification(
  rule: RealEstateTransactionRule
): TransactionRuleClassification {
  return {
    assignedAssetId: rule.assignedAssetId,
    category: rule.category,
    classification: "expense",
    note: null,
    ruleId: rule.id,
    ruleName: rule.name,
    transactionName: rule.setTransactionName?.trim() || null
  };
}
