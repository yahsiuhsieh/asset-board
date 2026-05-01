import type {
  RealEstateAssetDetail,
  RealEstatePropertyTransaction,
  RealEstateRentalStatus
} from "@/types/wealth";
import {
  getPropertyReviewMonths,
  getRentRecognitionMonth,
  normalizeReviewMonth
} from "@/lib/real-estate-monthly-review";

export type AnnualQualityIssueSeverity = "blocking" | "warning";

export type AnnualQualityIssueCode =
  | "missing_rent_months"
  | "open_monthly_reviews"
  | "unclassified_expense_transactions"
  | "missing_expense_category"
  | "ignored_transactions"
  | "no_expenses_recorded"
  | "low_coverage"
  | "vacant_rent_check_skipped";

export interface AnnualQualityIssue {
  id: string;
  code: AnnualQualityIssueCode;
  severity: AnnualQualityIssueSeverity;
  title: string;
  description: string;
  months?: string[];
  count?: number;
}

export interface PropertyAnnualQualityResult {
  propertyId: string;
  propertyName: string;
  rentalStatus: RealEstateRentalStatus;
  issues: AnnualQualityIssue[];
  blockingIssues: AnnualQualityIssue[];
  warningIssues: AnnualQualityIssue[];
}

function getCurrentYear(): string {
  return String(new Date().getFullYear());
}

function getTransactionYear(transaction: RealEstatePropertyTransaction): string {
  return transaction.postedAt.slice(0, 4);
}

function getTransactionsForYear(
  transactions: RealEstatePropertyTransaction[],
  year: string
): RealEstatePropertyTransaction[] {
  return transactions.filter((transaction) => getTransactionYear(transaction) === year);
}

function makeIssue(issue: AnnualQualityIssue): AnnualQualityIssue {
  return issue;
}

function splitIssues(issues: AnnualQualityIssue[]) {
  return {
    blockingIssues: issues.filter((issue) => issue.severity === "blocking"),
    warningIssues: issues.filter((issue) => issue.severity === "warning")
  };
}

export function getPortfolioAnnualReportYears(
  properties: RealEstateAssetDetail[],
  currentYear = getCurrentYear()
): string[] {
  const years = new Set<string>([currentYear]);

  for (const property of properties) {
    if (property.purchasedAt) {
      years.add(property.purchasedAt.slice(0, 4));
    }

    for (const transaction of property.propertyTransactions) {
      years.add(getTransactionYear(transaction));

      if (transaction.rentPeriodMonth) {
        years.add(transaction.rentPeriodMonth.slice(0, 4));
      }
    }

    for (const review of property.monthlyReviews ?? []) {
      years.add(review.reviewMonth.slice(0, 4));
    }
  }

  return Array.from(years)
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => b.localeCompare(a));
}

export function getDefaultPortfolioAnnualReportYear(
  years: string[],
  requestedYear?: string,
  currentYear = getCurrentYear()
): string {
  if (requestedYear && years.includes(requestedYear)) {
    return requestedYear;
  }

  if (years.includes(currentYear)) {
    return currentYear;
  }

  return years[0] ?? currentYear;
}

export function getPropertyAnnualQualityResult(
  property: RealEstateAssetDetail,
  year: string,
  today = new Date()
): PropertyAnnualQualityResult {
  const reviewMonths = getPropertyReviewMonths(property, year, today);
  const transactions = getTransactionsForYear(property.propertyTransactions, year);
  const monthlyReviews = property.monthlyReviews ?? [];
  const closedReviewMonths = new Set(
    monthlyReviews
      .filter(
        (review) =>
          review.closedAt && normalizeReviewMonth(review.reviewMonth).startsWith(year)
      )
      .map((review) => normalizeReviewMonth(review.reviewMonth))
  );
  const openReviewMonths = reviewMonths.filter((month) => !closedReviewMonths.has(month));
  const closedExpectedReviewMonths = reviewMonths.filter((month) =>
    closedReviewMonths.has(month)
  );
  const rentalIncomeMonths = new Set(
    property.propertyTransactions
      .filter(
        (transaction) =>
          transaction.classification === "rental_income" &&
          transaction.direction === "credit" &&
          getRentRecognitionMonth(transaction).startsWith(year)
      )
      .map(getRentRecognitionMonth)
  );
  const expenses = transactions.filter(
    (transaction) => transaction.classification === "expense"
  );
  const unclassifiedExpenseTransactions = transactions.filter(
    (transaction) =>
      transaction.direction === "debit" && transaction.classification == null
  );
  const ignoredTransactions = transactions.filter(
    (transaction) => transaction.classification === "ignored"
  );
  const missingCategoryExpenses = expenses.filter(
    (transaction) => transaction.category == null
  );
  const issues: AnnualQualityIssue[] = [];
  const missingRentMonths =
    property.monthlyRent > 0
      ? closedExpectedReviewMonths.filter((month) => !rentalIncomeMonths.has(month))
      : [];

  if (openReviewMonths.length > 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:open-monthly-reviews`,
        code: "open_monthly_reviews",
        severity: "blocking",
        title: "Open monthly reviews",
        description: `${openReviewMonths.length} expected ${openReviewMonths.length === 1 ? "month is" : "months are"} not closed.`,
        months: openReviewMonths,
        count: openReviewMonths.length
      })
    );
  }

  if (property.rentalStatus === "rented" && missingRentMonths.length > 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:missing-rent-months`,
        code: "missing_rent_months",
        severity: "blocking",
        title: "Missing rent months",
        description: `${missingRentMonths.length} expected rent ${missingRentMonths.length === 1 ? "month is" : "months are"} missing.`,
        months: missingRentMonths,
        count: missingRentMonths.length
      })
    );
  }

  if (property.rentalStatus === "vacant" && missingRentMonths.length > 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:vacant-rent-check-skipped`,
        code: "vacant_rent_check_skipped",
        severity: "warning",
        title: "Rent check skipped",
        description: "This property is marked vacant, so missing rent does not block export.",
        months: missingRentMonths,
        count: missingRentMonths.length
      })
    );
  }

  if (unclassifiedExpenseTransactions.length > 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:unclassified-expense-transactions`,
        code: "unclassified_expense_transactions",
        severity: "blocking",
        title: "Unclassified expense transactions",
        description: `${unclassifiedExpenseTransactions.length} expense ${unclassifiedExpenseTransactions.length === 1 ? "transaction needs" : "transactions need"} review.`,
        count: unclassifiedExpenseTransactions.length
      })
    );
  }

  if (missingCategoryExpenses.length > 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:missing-expense-category`,
        code: "missing_expense_category",
        severity: "blocking",
        title: "Missing expense category",
        description: `${missingCategoryExpenses.length} expense ${missingCategoryExpenses.length === 1 ? "transaction needs" : "transactions need"} a category.`,
        count: missingCategoryExpenses.length
      })
    );
  }

  if (ignoredTransactions.length > 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:ignored-transactions`,
        code: "ignored_transactions",
        severity: "warning",
        title: "Ignored transactions",
        description: `${ignoredTransactions.length} transaction ${ignoredTransactions.length === 1 ? "was" : "were"} ignored this year.`,
        count: ignoredTransactions.length
      })
    );
  }

  if (
    reviewMonths.length > 0 &&
    expenses.length === 0 &&
    unclassifiedExpenseTransactions.length === 0
  ) {
    issues.push(
      makeIssue({
        id: `${property.id}:no-expenses-recorded`,
        code: "no_expenses_recorded",
        severity: "warning",
        title: "No expenses recorded",
        description: "No expense transactions are recorded for this property in the selected year."
      })
    );
  }

  if (reviewMonths.length >= 2 && transactions.length === 0) {
    issues.push(
      makeIssue({
        id: `${property.id}:low-coverage`,
        code: "low_coverage",
        severity: "warning",
        title: "Low transaction coverage",
        description: "No reviewed ledger transactions are recorded for the selected year."
      })
    );
  }

  const { blockingIssues, warningIssues } = splitIssues(issues);

  return {
    propertyId: property.id,
    propertyName: property.name,
    rentalStatus: property.rentalStatus,
    issues,
    blockingIssues,
    warningIssues
  };
}

export function getPortfolioAnnualQualityResults(
  properties: RealEstateAssetDetail[],
  year: string,
  today = new Date()
): PropertyAnnualQualityResult[] {
  return properties.map((property) =>
    getPropertyAnnualQualityResult(property, year, today)
  );
}

export function getBlockingAnnualQualityIssues(
  results: PropertyAnnualQualityResult[]
): Array<{
  propertyId: string;
  propertyName: string;
  issue: AnnualQualityIssue;
}> {
  return results.flatMap((result) =>
    result.blockingIssues.map((issue) => ({
      propertyId: result.propertyId,
      propertyName: result.propertyName,
      issue
    }))
  );
}

export function hasBlockingAnnualQualityIssues(
  results: PropertyAnnualQualityResult[]
): boolean {
  return getBlockingAnnualQualityIssues(results).length > 0;
}
