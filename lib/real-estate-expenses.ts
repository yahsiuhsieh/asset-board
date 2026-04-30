import type { RealEstatePropertyTransaction } from "@/types/wealth";

export const expenseCategoryLabels = {
  taxes: "Taxes",
  insurance: "Insurance",
  maintenance: "Maintenance",
  hoa: "HOA",
  utilities: "Utilities",
  other: "Other"
} as const;

export function getCurrentMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

export function getExpenseTransactionsForMonth(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): RealEstatePropertyTransaction[] {
  return transactions.filter(
    (transaction) =>
      transaction.classification === "expense" &&
      transaction.direction === "debit" &&
      transaction.postedAt.slice(0, 7) === month
  );
}

export function getRecordedExpensesForMonth(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): number {
  return getExpenseTransactionsForMonth(transactions, month).reduce(
    (total, transaction) => total + transaction.amount,
    0
  );
}

export function hasRecordedExpensesForMonth(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): boolean {
  return getExpenseTransactionsForMonth(transactions, month).length > 0;
}

export function getElapsedMonthsInYear(month = getCurrentMonth()): number {
  const monthNumber = Number(month.slice(5, 7));

  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return 1;
  }

  return monthNumber;
}

export function getYtdExpenseTransactions(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): RealEstatePropertyTransaction[] {
  const year = month.slice(0, 4);

  return transactions.filter((transaction) => {
    const postedMonth = transaction.postedAt.slice(0, 7);

    return (
      transaction.classification === "expense" &&
      transaction.direction === "debit" &&
      postedMonth.startsWith(year) &&
      postedMonth <= month
    );
  });
}

export function getYtdExpenses(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): number {
  return getYtdExpenseTransactions(transactions, month).reduce(
    (total, transaction) => total + transaction.amount,
    0
  );
}

export function getYtdAverageMonthlyExpenses(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): number {
  return getYtdExpenses(transactions, month) / getElapsedMonthsInYear(month);
}
