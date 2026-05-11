import type { RealEstateExpenseCategory } from "@/types/wealth";

export type MonthlySyncTransactionDirection = "credit" | "debit";
export type MonthlySyncTransactionClassification =
  | "rental_income"
  | "expense"
  | "ignored";

export interface MonthlySyncBankTransaction {
  accountId: string;
  accountName: string;
  amount: number;
  connectionId: string;
  description: string;
  direction: MonthlySyncTransactionDirection;
  id: string;
  memo: string;
  postedAt: string;
  rawBankTransactionId?: string | null;
  title: string;
}

export interface MonthlySyncClassification {
  classification: MonthlySyncTransactionClassification | null;
  id: string;
  rent_period_month: string | null;
}

export interface MonthlyExpenseRuleMatch {
  assignedAssetId: string | null;
  category: RealEstateExpenseCategory;
  id: string;
  name: string;
  transactionName: string | null;
}

export interface MonthlyRentCreditSyncDecision {
  amountMatchesTarget: boolean;
  classification: MonthlySyncClassification | null;
  rentPeriodMonth: string;
  shouldAutoRecordRentalIncome: boolean;
  shouldCreatePendingReview: boolean;
  transaction: MonthlySyncBankTransaction;
}

export interface MonthlyExpenseDebitSyncDecision {
  classification: MonthlySyncClassification | null;
  ruleMatch: MonthlyExpenseRuleMatch | null;
  shouldAutoRecordExpense: boolean;
  shouldCreatePendingReview: boolean;
  shouldShowAsUnclassified: boolean;
  transaction: MonthlySyncBankTransaction;
}

function getReviewMonthPrefix(reviewMonth: string): string {
  return reviewMonth.slice(0, 7);
}

function transactionMatchesRent(
  transaction: MonthlySyncBankTransaction,
  expectedAmount: number,
  tolerance: number
): boolean {
  return (
    transaction.direction === "credit" &&
    Math.abs(transaction.amount - expectedAmount) <= tolerance
  );
}

function isReviewableRentCredit(
  transaction: MonthlySyncBankTransaction,
  minimumAmount: number
): boolean {
  return transaction.direction === "credit" && transaction.amount >= minimumAmount;
}

export function getMonthlyRentCreditSyncDecisions({
  expectedAmount,
  getClassification,
  minimumAmount,
  reviewMonth,
  tolerance,
  transactions
}: {
  expectedAmount: number;
  getClassification: (
    transaction: MonthlySyncBankTransaction
  ) => MonthlySyncClassification | null | undefined;
  minimumAmount: number;
  reviewMonth: string;
  tolerance: number;
  transactions: MonthlySyncBankTransaction[];
}): MonthlyRentCreditSyncDecision[] {
  const reviewMonthPrefix = getReviewMonthPrefix(reviewMonth);

  return transactions
    .filter((transaction) => isReviewableRentCredit(transaction, minimumAmount))
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .map((transaction) => {
      const classification = getClassification(transaction) ?? null;
      const amountMatchesTarget = transactionMatchesRent(
        transaction,
        expectedAmount,
        tolerance
      );
      const isPostedInReviewMonth =
        transaction.postedAt.slice(0, 7) === reviewMonthPrefix;
      const shouldAutoRecordRentalIncome =
        !classification && isPostedInReviewMonth && amountMatchesTarget;

      return {
        amountMatchesTarget,
        classification,
        rentPeriodMonth: classification?.rent_period_month ?? reviewMonth,
        shouldAutoRecordRentalIncome,
        shouldCreatePendingReview: !classification && !shouldAutoRecordRentalIncome,
        transaction
      };
    });
}

export function filterRentCreditDecisionsForReviewScope({
  decisions,
  reviewMonth,
  useBufferedFallback
}: {
  decisions: MonthlyRentCreditSyncDecision[];
  reviewMonth: string;
  useBufferedFallback: boolean;
}): MonthlyRentCreditSyncDecision[] {
  if (useBufferedFallback) {
    return decisions;
  }

  const reviewMonthPrefix = getReviewMonthPrefix(reviewMonth);

  return decisions.filter(
    (decision) => decision.transaction.postedAt.slice(0, 7) === reviewMonthPrefix
  );
}

export function getMonthlyExpenseDebitSyncDecisions({
  getClassification,
  getRuleMatch,
  transactions
}: {
  getClassification: (
    transaction: MonthlySyncBankTransaction
  ) => MonthlySyncClassification | null | undefined;
  getRuleMatch?: (
    transaction: MonthlySyncBankTransaction
  ) => MonthlyExpenseRuleMatch | null | undefined;
  transactions: MonthlySyncBankTransaction[];
}): MonthlyExpenseDebitSyncDecision[] {
  return transactions
    .filter((transaction) => transaction.direction === "debit")
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .map((transaction) => {
      const classification = getClassification(transaction) ?? null;
      const hasClassification = Boolean(classification?.classification);
      const ruleMatch = !hasClassification ? getRuleMatch?.(transaction) ?? null : null;

      return {
        classification,
        ruleMatch,
        shouldAutoRecordExpense: Boolean(ruleMatch),
        shouldCreatePendingReview: !classification && !ruleMatch,
        shouldShowAsUnclassified: !classification?.classification && !ruleMatch,
        transaction
      };
    });
}
