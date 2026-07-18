import { getRealEstateAssetsWithCoverPhoto } from "@/lib/real-estate";
import {
  sendMonthlyReviewEmail,
  type MonthlyReviewEmailPropertySummary,
  type MonthlyReviewEmailSendResult
} from "@/lib/real-estate-monthly-review-email";
import {
  closeRealEstateMonthlyReview,
  MONTHLY_AUTO_REVIEW_CLOSE_NOTE,
  type RealEstateMonthlyReviewCloseResult
} from "@/lib/real-estate-monthly-review-service";
import {
  getMonthlyReviewAssessment,
  type MonthlyReviewSubstatus
} from "@/lib/real-estate-monthly-review";
import type { RealEstateAssetDetail } from "@/types/wealth";

export type MonthlyAutoReviewPropertyStatus =
  | "blocked"
  | "closed"
  | "error"
  | "would_close";

export interface MonthlyAutoReviewPropertyResult {
  assetId: string;
  blockers: string[];
  closed: boolean;
  error: string | null;
  expenseStatus: MonthlyReviewSubstatus;
  expenseTransactionsNeedingReview: number;
  missingExpenseCategoryCount: number;
  pendingExpenseTransactionCount: number;
  pendingRentCreditCount: number;
  propertyName: string;
  recordedExpenseCount: number;
  recordedExpenses: number;
  rentCollected: number;
  rentCreditsNeedingReview: number;
  rentStatus: MonthlyReviewSubstatus;
  reviewUrl: string;
  ruleMatchedExpenseCount: number;
  status: MonthlyAutoReviewPropertyStatus;
  syncedRentCount: number;
  targetRent: number;
}

export interface MonthlyAutoReviewTotals {
  blocked: number;
  closed: number;
  errors: number;
  properties: number;
  wouldClose: number;
}

export interface MonthlyRealEstateAutoReviewResult {
  dryRun: boolean;
  finishedAt: string;
  notification: MonthlyReviewEmailSendResult;
  properties: MonthlyAutoReviewPropertyResult[];
  requiresReview: boolean;
  reviewMonth: string;
  startedAt: string;
  totals: MonthlyAutoReviewTotals;
}

interface MonthlyAutoReviewDependencies {
  closeMonthlyReview?: typeof closeRealEstateMonthlyReview;
  loadProperties?: typeof getRealEstateAssetsWithCoverPhoto;
  sendEmail?: typeof sendMonthlyReviewEmail;
}

export function normalizeAutoReviewMonth(reviewMonth: string): string {
  if (/^\d{4}-\d{2}$/.test(reviewMonth)) {
    return reviewMonth;
  }

  if (/^\d{4}-\d{2}-01$/.test(reviewMonth)) {
    return reviewMonth.slice(0, 7);
  }

  throw new Error("reviewMonth must use YYYY-MM.");
}

export function getAutoReviewMonthDate(reviewMonth: string): string {
  return `${normalizeAutoReviewMonth(reviewMonth)}-01`;
}

export function getPreviousReviewMonth(now = new Date()): string {
  const previousMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const year = previousMonth.getUTCFullYear();
  const month = String(previousMonth.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function buildPropertyMonthlyReviewUrl({
  appUrl,
  assetId,
  reviewMonth
}: {
  appUrl: string;
  assetId: string;
  reviewMonth: string;
}): string {
  const baseUrl = appUrl.replace(/\/+$/, "");

  return `${baseUrl}/real-estate/${encodeURIComponent(
    assetId
  )}?reviewMonth=${encodeURIComponent(reviewMonth)}#monthly-review`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Unknown monthly review error.";
}

export function summarizeMonthlyReviewCloseResult({
  appUrl,
  closeResult,
  property,
  reviewMonth
}: {
  appUrl: string;
  closeResult: RealEstateMonthlyReviewCloseResult;
  property: RealEstateAssetDetail;
  reviewMonth: string;
}): MonthlyAutoReviewPropertyResult {
  const assessment =
    closeResult.assessment ?? getMonthlyReviewAssessment(property, reviewMonth);

  return {
    assetId: property.id,
    blockers: closeResult.blockers,
    closed: closeResult.status === "closed",
    error: null,
    expenseStatus: assessment.expenseStatus,
    expenseTransactionsNeedingReview:
      assessment.unclassifiedExpenseCount + assessment.missingExpenseCategoryCount,
    missingExpenseCategoryCount: assessment.missingExpenseCategoryCount,
    pendingExpenseTransactionCount:
      closeResult.expenseSyncResult?.pendingReviewCount ??
      assessment.unclassifiedExpenseCount,
    pendingRentCreditCount:
      closeResult.rentSyncResult?.pendingReviewCount ??
      assessment.unclassifiedRentCreditCount,
    propertyName: property.name,
    recordedExpenseCount: assessment.recordedExpenseCount,
    recordedExpenses: assessment.recordedExpenses,
    rentCollected: assessment.rentCollected,
    rentCreditsNeedingReview: assessment.unclassifiedRentCreditCount,
    rentStatus: assessment.rentStatus,
    reviewUrl: buildPropertyMonthlyReviewUrl({
      appUrl,
      assetId: property.id,
      reviewMonth
    }),
    ruleMatchedExpenseCount: closeResult.expenseSyncResult?.ruleMatchedCount ?? 0,
    status: closeResult.status,
    syncedRentCount: closeResult.rentSyncResult?.autoMatchedCount ?? 0,
    targetRent: assessment.targetRent
  };
}

export function summarizeMonthlyReviewError({
  appUrl,
  error,
  property,
  reviewMonth
}: {
  appUrl: string;
  error: unknown;
  property: RealEstateAssetDetail;
  reviewMonth: string;
}): MonthlyAutoReviewPropertyResult {
  const assessment = getMonthlyReviewAssessment(property, reviewMonth);
  const message = getErrorMessage(error);

  return {
    assetId: property.id,
    blockers: [`sync error: ${message}`],
    closed: false,
    error: message,
    expenseStatus: assessment.expenseStatus,
    expenseTransactionsNeedingReview:
      assessment.unclassifiedExpenseCount + assessment.missingExpenseCategoryCount,
    missingExpenseCategoryCount: assessment.missingExpenseCategoryCount,
    pendingExpenseTransactionCount: assessment.unclassifiedExpenseCount,
    pendingRentCreditCount: assessment.unclassifiedRentCreditCount,
    propertyName: property.name,
    recordedExpenseCount: assessment.recordedExpenseCount,
    recordedExpenses: assessment.recordedExpenses,
    rentCollected: assessment.rentCollected,
    rentCreditsNeedingReview: assessment.unclassifiedRentCreditCount,
    rentStatus: assessment.rentStatus,
    reviewUrl: buildPropertyMonthlyReviewUrl({
      appUrl,
      assetId: property.id,
      reviewMonth
    }),
    ruleMatchedExpenseCount: 0,
    status: "error",
    syncedRentCount: 0,
    targetRent: assessment.targetRent
  };
}

export function getMonthlyAutoReviewTotals(
  properties: MonthlyAutoReviewPropertyResult[]
): MonthlyAutoReviewTotals {
  return {
    blocked: properties.filter((property) => property.status === "blocked").length,
    closed: properties.filter((property) => property.status === "closed").length,
    errors: properties.filter((property) => property.status === "error").length,
    properties: properties.length,
    wouldClose: properties.filter((property) => property.status === "would_close")
      .length
  };
}

export function doesMonthlyAutoReviewRequireReview(
  properties: MonthlyAutoReviewPropertyResult[]
): boolean {
  return properties.some(
    (property) => property.status === "blocked" || property.status === "error"
  );
}

function toEmailPropertySummary(
  property: MonthlyAutoReviewPropertyResult
): MonthlyReviewEmailPropertySummary {
  return {
    assetId: property.assetId,
    blockers: property.blockers,
    error: property.error,
    expenseStatus: property.expenseStatus,
    expenseTransactionsNeedingReview: property.expenseTransactionsNeedingReview,
    propertyName: property.propertyName,
    recordedExpenseCount: property.recordedExpenseCount,
    recordedExpenses: property.recordedExpenses,
    rentCollected: property.rentCollected,
    rentCreditsNeedingReview: property.rentCreditsNeedingReview,
    rentStatus: property.rentStatus,
    reviewUrl: property.reviewUrl,
    status: property.status,
    targetRent: property.targetRent
  };
}

export async function runMonthlyRealEstateAutoReview({
  dependencies = {},
  dryRun = false,
  now = new Date(),
  reviewMonth
}: {
  dependencies?: MonthlyAutoReviewDependencies;
  dryRun?: boolean;
  now?: Date;
  reviewMonth?: string;
} = {}): Promise<MonthlyRealEstateAutoReviewResult> {
  const startedAt = now.toISOString();
  const normalizedReviewMonth = normalizeAutoReviewMonth(
    reviewMonth ?? getPreviousReviewMonth(now)
  );
  const reviewMonthDate = getAutoReviewMonthDate(normalizedReviewMonth);
  const appUrl = process.env.ASSETBOARD_APP_URL?.trim() ?? "";
  const loadProperties =
    dependencies.loadProperties ?? getRealEstateAssetsWithCoverPhoto;
  const closeMonthlyReview =
    dependencies.closeMonthlyReview ?? closeRealEstateMonthlyReview;
  const sendEmail = dependencies.sendEmail ?? sendMonthlyReviewEmail;
  const properties = await loadProperties();
  const results: MonthlyAutoReviewPropertyResult[] = [];

  for (const property of properties) {
    try {
      const closeResult = await closeMonthlyReview({
        assetId: property.id,
        dryRun,
        note: MONTHLY_AUTO_REVIEW_CLOSE_NOTE,
        now,
        reviewMonth: reviewMonthDate
      });

      results.push(
        summarizeMonthlyReviewCloseResult({
          appUrl,
          closeResult,
          property,
          reviewMonth: normalizedReviewMonth
        })
      );
    } catch (error) {
      results.push(
        summarizeMonthlyReviewError({
          appUrl,
          error,
          property,
          reviewMonth: normalizedReviewMonth
        })
      );
    }
  }

  const requiresReview = doesMonthlyAutoReviewRequireReview(results);
  const notification = await sendEmail({
    summary: {
      dryRun,
      properties: results.map(toEmailPropertySummary),
      requiresReview,
      reviewMonth: normalizedReviewMonth
    }
  });
  const finishedAt = new Date().toISOString();

  return {
    dryRun,
    finishedAt,
    notification,
    properties: results,
    requiresReview,
    reviewMonth: normalizedReviewMonth,
    startedAt,
    totals: getMonthlyAutoReviewTotals(results)
  };
}
