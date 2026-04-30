import type { RealEstatePropertyTransaction } from "@/types/wealth";

export function getCurrentMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

export function getRentalIncomeTransactionsForMonth(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): RealEstatePropertyTransaction[] {
  return transactions.filter(
    (transaction) =>
      transaction.classification === "rental_income" &&
      transaction.direction === "credit" &&
      transaction.postedAt.slice(0, 7) === month
  );
}

export function getRentalIncomeForMonth(
  transactions: RealEstatePropertyTransaction[] = [],
  month = getCurrentMonth()
): number {
  return getRentalIncomeTransactionsForMonth(transactions, month).reduce(
    (total, transaction) => total + transaction.amount,
    0
  );
}
