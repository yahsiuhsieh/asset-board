import {
  getPropertyReviewMonths,
  isReviewMonthComplete,
  normalizeReviewMonth
} from "@/lib/real-estate-monthly-review";
import type { RealEstateAssetDetail, RealEstateBankConnection } from "@/types/wealth";

export type RealEstateDataCoverageStatus =
  | "closed_accepted"
  | "complete"
  | "in_progress"
  | "needs_sync"
  | "needs_reconnect"
  | "no_bank_coverage";

export type RealEstateDataCoverageAccountStatus =
  | "closed_accepted"
  | "complete"
  | "in_progress"
  | "needs_sync"
  | "needs_reconnect";

export interface RealEstateDataCoverageAccountAssessment {
  accountName: string;
  connectionId: string;
  institutionName: string | null;
  lastFour: string | null;
  lastSyncedAt: string | null;
  status: RealEstateDataCoverageAccountStatus;
  syncedEndDate: string | null;
  syncedStartDate: string | null;
}

export interface RealEstateMonthlyDataCoverageAssessment {
  accounts: RealEstateDataCoverageAccountAssessment[];
  activeAccountCount: number;
  closedAt: string | null;
  disconnectedAccountCount: number;
  endDate: string;
  isReviewMonthComplete: boolean;
  reviewMonth: string;
  startDate: string;
  status: RealEstateDataCoverageStatus;
}

export interface RealEstateDataCoverageDateRange {
  endDate: string;
  startDate: string;
}

export interface RealEstateDataCoverageRangeDisplay {
  hasSyncedCoverage: boolean;
  isFullyCovered: boolean;
  missingRanges: RealEstateDataCoverageDateRange[];
  syncedStartPercent: number;
  syncedWidthPercent: number;
}

function getMonthRange(month: string): { endDate: string; startDate: string } {
  const reviewMonth = normalizeReviewMonth(month);
  const [year, monthNumber] = reviewMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  const end = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);

  return {
    endDate: end.toISOString().slice(0, 10),
    startDate: start.toISOString().slice(0, 10)
  };
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function getDateDays(value: string): number {
  return Math.floor(parseDate(value).getTime() / (24 * 60 * 60 * 1000));
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function clampDate(value: string, min: string, max: string): string {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function hasFullMonthCoverage(
  connection: Pick<
    RealEstateBankConnection,
    "rawTransactionsSyncedEndDate" | "rawTransactionsSyncedStartDate"
  >,
  startDate: string,
  endDate: string
): boolean {
  return (
    Boolean(connection.rawTransactionsSyncedStartDate) &&
    Boolean(connection.rawTransactionsSyncedEndDate) &&
    connection.rawTransactionsSyncedStartDate! <= startDate &&
    connection.rawTransactionsSyncedEndDate! >= endDate
  );
}

export function getDataCoverageRangeDisplay({
  account,
  endDate,
  startDate
}: {
  account: Pick<
    RealEstateDataCoverageAccountAssessment,
    "syncedEndDate" | "syncedStartDate"
  >;
  endDate: string;
  startDate: string;
}): RealEstateDataCoverageRangeDisplay {
  const monthStartDays = getDateDays(startDate);
  const monthEndDays = getDateDays(endDate);
  const totalDays = Math.max(monthEndDays - monthStartDays + 1, 1);
  const missingFullMonth = [{ startDate, endDate }];

  if (!account.syncedStartDate || !account.syncedEndDate) {
    return {
      hasSyncedCoverage: false,
      isFullyCovered: false,
      missingRanges: missingFullMonth,
      syncedStartPercent: 0,
      syncedWidthPercent: 0
    };
  }

  if (account.syncedEndDate < account.syncedStartDate) {
    return {
      hasSyncedCoverage: false,
      isFullyCovered: false,
      missingRanges: missingFullMonth,
      syncedStartPercent: 0,
      syncedWidthPercent: 0
    };
  }

  if (account.syncedEndDate < startDate || account.syncedStartDate > endDate) {
    return {
      hasSyncedCoverage: false,
      isFullyCovered: false,
      missingRanges: missingFullMonth,
      syncedStartPercent: 0,
      syncedWidthPercent: 0
    };
  }

  const syncedStartDate = clampDate(account.syncedStartDate, startDate, endDate);
  const syncedEndDate = clampDate(account.syncedEndDate, startDate, endDate);
  const syncedStartDays = getDateDays(syncedStartDate);
  const syncedEndDays = getDateDays(syncedEndDate);
  const missingRanges: RealEstateDataCoverageDateRange[] = [];

  if (syncedStartDate > startDate) {
    missingRanges.push({
      endDate: addDays(syncedStartDate, -1),
      startDate
    });
  }

  if (syncedEndDate < endDate) {
    missingRanges.push({
      endDate,
      startDate: addDays(syncedEndDate, 1)
    });
  }

  return {
    hasSyncedCoverage: true,
    isFullyCovered: missingRanges.length === 0,
    missingRanges,
    syncedStartPercent: ((syncedStartDays - monthStartDays) / totalDays) * 100,
    syncedWidthPercent: ((syncedEndDays - syncedStartDays + 1) / totalDays) * 100
  };
}

function getClosedReviewDate(
  property: Partial<Pick<RealEstateAssetDetail, "monthlyReviews">>,
  month: string
): string | null {
  return (
    property.monthlyReviews?.find(
      (review) => review.closedAt && normalizeReviewMonth(review.reviewMonth) === month
    )?.closedAt ?? null
  );
}

function getAccountCoverageStatus({
  closedAt,
  connection,
  endDate,
  isCompleteMonth,
  startDate
}: {
  closedAt: string | null;
  connection: RealEstateBankConnection;
  endDate: string;
  isCompleteMonth: boolean;
  startDate: string;
}): RealEstateDataCoverageAccountStatus {
  if (closedAt) {
    return "closed_accepted";
  }

  if (connection.status !== "active") {
    return "needs_reconnect";
  }

  if (!isCompleteMonth) {
    return "in_progress";
  }

  return hasFullMonthCoverage(connection, startDate, endDate)
    ? "complete"
    : "needs_sync";
}

export function getMonthlyDataCoverageAssessment(
  property: Pick<RealEstateAssetDetail, "bankConnections"> &
    Partial<Pick<RealEstateAssetDetail, "monthlyReviews">>,
  month: string,
  today = new Date()
): RealEstateMonthlyDataCoverageAssessment {
  const reviewMonth = normalizeReviewMonth(month);
  const { startDate, endDate } = getMonthRange(reviewMonth);
  const completeMonth = isReviewMonthComplete(reviewMonth, today);
  const closedAt = getClosedReviewDate(property, reviewMonth);
  const accounts = property.bankConnections.map((connection) => ({
    accountName: connection.accountName,
    connectionId: connection.id,
    institutionName: connection.institutionName,
    lastFour: connection.lastFour,
    lastSyncedAt: connection.lastSyncedAt,
    status: getAccountCoverageStatus({
      closedAt,
      connection,
      endDate,
      isCompleteMonth: completeMonth,
      startDate
    }),
    syncedEndDate: connection.rawTransactionsSyncedEndDate,
    syncedStartDate: connection.rawTransactionsSyncedStartDate
  }));
  const activeAccountCount = property.bankConnections.filter(
    (connection) => connection.status === "active"
  ).length;
  const disconnectedAccountCount = property.bankConnections.length - activeAccountCount;
  const hasDisconnectedAccounts = disconnectedAccountCount > 0;
  const status: RealEstateDataCoverageStatus =
    closedAt
      ? "closed_accepted"
      : property.bankConnections.length === 0
      ? "no_bank_coverage"
      : hasDisconnectedAccounts
        ? "needs_reconnect"
        : !completeMonth
          ? "in_progress"
          : accounts.every((account) => account.status === "complete")
            ? "complete"
            : "needs_sync";

  return {
    accounts,
    activeAccountCount,
    closedAt,
    disconnectedAccountCount,
    endDate,
    isReviewMonthComplete: completeMonth,
    reviewMonth,
    startDate,
    status
  };
}

export function getPropertyAnnualDataCoverageIssues({
  property,
  today,
  year
}: {
  property: RealEstateAssetDetail;
  today?: Date;
  year: string;
}): RealEstateMonthlyDataCoverageAssessment[] {
  if (property.bankConnections.length === 0) {
    return [];
  }

  return getPropertyReviewMonths(property, year, today).flatMap((month) => {
    const assessment = getMonthlyDataCoverageAssessment(property, month, today);

    return assessment.status === "needs_sync" ||
      assessment.status === "needs_reconnect"
      ? [assessment]
      : [];
  });
}

export function isMonthlyDataCoverageCloseBlocked(
  assessment: Pick<RealEstateMonthlyDataCoverageAssessment, "status">
): boolean {
  return (
    assessment.status === "needs_reconnect" || assessment.status === "needs_sync"
  );
}
