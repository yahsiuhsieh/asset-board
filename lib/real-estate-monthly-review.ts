import type {
  RealEstateAssetDetail,
  RealEstatePropertyTransaction,
  RealEstateRentalStatus
} from "@/types/wealth";

export type MonthlyReviewSubstatus = "ready" | "needs_review";
export type MonthlyReviewStatus = "open" | "ready_to_close" | "closed";

export const RENT_TRANSACTION_SEARCH_BUFFER_DAYS = 10;

export interface MonthlyReviewAssessment {
  closedAt: string | null;
  expenseStatus: MonthlyReviewSubstatus;
  ignoredExpenseCount: number;
  isReadyToClose: boolean;
  isReviewMonthComplete: boolean;
  missingExpenseCategoryCount: number;
  note: string | null;
  recordedExpenseCount: number;
  recordedExpenses: number;
  rentCollected: number;
  rentStatus: MonthlyReviewSubstatus;
  reviewMonth: string;
  reviewMonthDate: string;
  status: MonthlyReviewStatus;
  targetRent: number;
  unclassifiedRentCreditCount: number;
  unclassifiedExpenseCount: number;
}

interface ReviewableProperty {
  id: string;
  monthlyRent: number;
  monthlyReviews?: RealEstateAssetDetail["monthlyReviews"];
  propertyTransactions: RealEstatePropertyTransaction[];
  purchasedAt: string | null;
  rentalStatus: RealEstateRentalStatus;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function normalizeReviewMonth(month: string): string {
  if (/^\d{4}-\d{2}$/.test(month)) {
    return month;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) {
    return month.slice(0, 7);
  }

  return month;
}

export function getReviewMonthDate(month: string): string {
  return `${normalizeReviewMonth(month)}-01`;
}

function getReviewMonthParts(month: string): { month: number; year: number } | null {
  const reviewMonth = normalizeReviewMonth(month);
  const [year, monthNumber] = reviewMonth.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  return {
    month: monthNumber,
    year
  };
}

export function isReviewMonthComplete(month: string, today = new Date()): boolean {
  const parts = getReviewMonthParts(month);

  if (!parts) {
    return false;
  }

  const nextMonthStart = new Date(parts.year, parts.month, 1);

  return today >= nextMonthStart;
}

export function getPostedMonth(transaction: RealEstatePropertyTransaction): string {
  return transaction.postedAt.slice(0, 7);
}

export function getRentRecognitionMonth(
  transaction: RealEstatePropertyTransaction
): string {
  return (transaction.rentPeriodMonth ?? transaction.postedAt).slice(0, 7);
}

export function getRentalIncomeTransactionsForReviewMonth(
  transactions: RealEstatePropertyTransaction[] = [],
  month: string
): RealEstatePropertyTransaction[] {
  const reviewMonth = normalizeReviewMonth(month);

  return transactions.filter(
    (transaction) =>
      transaction.classification === "rental_income" &&
      transaction.direction === "credit" &&
      getRentRecognitionMonth(transaction) === reviewMonth
  );
}

export function getPropertyReviewMonths(
  property: Pick<ReviewableProperty, "purchasedAt">,
  year: string,
  today = new Date()
): string[] {
  const numericYear = Number(year);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  if (!Number.isInteger(numericYear) || numericYear > currentYear) {
    return [];
  }

  const endMonth = numericYear === currentYear ? currentMonth - 1 : 12;
  let startMonth = 1;

  if (property.purchasedAt) {
    const purchasedYear = Number(property.purchasedAt.slice(0, 4));
    const purchasedMonth = Number(property.purchasedAt.slice(5, 7));

    if (Number.isInteger(purchasedYear) && purchasedYear > numericYear) {
      return [];
    }

    if (
      purchasedYear === numericYear &&
      Number.isInteger(purchasedMonth) &&
      purchasedMonth >= 1 &&
      purchasedMonth <= 12
    ) {
      startMonth = purchasedMonth;
    }
  }

  if (startMonth > endMonth) {
    return [];
  }

  return Array.from({ length: endMonth - startMonth + 1 }, (_, index) => {
    const month = String(startMonth + index).padStart(2, "0");

    return `${year}-${month}`;
  });
}

export function getMonthlyReviewAssessment(
  property: ReviewableProperty,
  month: string,
  today = new Date()
): MonthlyReviewAssessment {
  const reviewMonth = normalizeReviewMonth(month);
  const reviewMonthDate = getReviewMonthDate(reviewMonth);
  const reviewMonthComplete = isReviewMonthComplete(reviewMonth, today);
  const savedReview = property.monthlyReviews?.find(
    (review) => normalizeReviewMonth(review.reviewMonth) === reviewMonth
  );
  const rentalIncomeTransactions = getRentalIncomeTransactionsForReviewMonth(
    property.propertyTransactions,
    reviewMonth
  );
  const reviewMonthRentCreditTransactions = property.propertyTransactions.filter(
    (transaction) =>
      transaction.direction === "credit" &&
      getRentRecognitionMonth(transaction) === reviewMonth
  );
  const unclassifiedRentCreditCount = reviewMonthRentCreditTransactions.filter(
    (transaction) => transaction.classification == null
  ).length;
  const rentCollected = sum(
    rentalIncomeTransactions.map((transaction) => Math.abs(transaction.amount))
  );
  const targetRent = Math.max(property.monthlyRent, 0);
  const rentRequired = property.rentalStatus === "rented" && targetRent > 0;
  const rentStatus: MonthlyReviewSubstatus =
    (!rentRequired || rentCollected >= targetRent) && unclassifiedRentCreditCount === 0
      ? "ready"
      : "needs_review";
  const reviewMonthExpenseTransactions = property.propertyTransactions.filter(
    (transaction) =>
      transaction.direction === "debit" && getPostedMonth(transaction) === reviewMonth
  );
  const unclassifiedExpenseCount = reviewMonthExpenseTransactions.filter(
    (transaction) => transaction.classification == null
  ).length;
  const missingExpenseCategoryCount = reviewMonthExpenseTransactions.filter(
    (transaction) =>
      transaction.classification === "expense" && transaction.category == null
  ).length;
  const recordedExpenseTransactions = reviewMonthExpenseTransactions.filter(
    (transaction) => transaction.classification === "expense"
  );
  const ignoredExpenseCount = reviewMonthExpenseTransactions.filter(
    (transaction) => transaction.classification === "ignored"
  ).length;
  const expenseStatus: MonthlyReviewSubstatus =
    unclassifiedExpenseCount === 0 && missingExpenseCategoryCount === 0
      ? "ready"
      : "needs_review";
  const reviewDataReady = rentStatus === "ready" && expenseStatus === "ready";
  const isReadyToClose = reviewDataReady && reviewMonthComplete;
  const closedAt = savedReview?.closedAt ?? null;

  return {
    closedAt,
    expenseStatus,
    ignoredExpenseCount,
    isReadyToClose,
    isReviewMonthComplete: reviewMonthComplete,
    missingExpenseCategoryCount,
    note: savedReview?.note ?? null,
    recordedExpenseCount: recordedExpenseTransactions.length,
    recordedExpenses: sum(
      recordedExpenseTransactions.map((transaction) => Math.abs(transaction.amount))
    ),
    rentCollected,
    rentStatus,
    reviewMonth,
    reviewMonthDate,
    status: closedAt ? "closed" : isReadyToClose ? "ready_to_close" : "open",
    targetRent,
    unclassifiedRentCreditCount,
    unclassifiedExpenseCount
  };
}
