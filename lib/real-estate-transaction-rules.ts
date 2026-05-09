import type {
  RealEstateExpenseCategory,
  RealEstateTransactionRule
} from "@/types/wealth";

export interface TransactionRuleMatchInput {
  assetId: string;
  amount: number;
  description: string;
  direction: "credit" | "debit";
}

export interface TransactionRuleClassification {
  category: RealEstateExpenseCategory;
  classification: "expense";
  note: string;
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

  if (rule.assetId && rule.assetId !== transaction.assetId) {
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
    category: rule.category,
    classification: "expense",
    note: `Classified by rule: ${rule.name}`,
    ruleId: rule.id,
    ruleName: rule.name,
    transactionName: rule.setTransactionName?.trim() || null
  };
}
