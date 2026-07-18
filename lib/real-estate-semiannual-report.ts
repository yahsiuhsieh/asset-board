import { getRealEstateAssetsWithCoverPhoto } from "@/lib/real-estate";
import {
  getAnnualReportPeriod,
  normalizeAnnualReportThroughMonth,
  normalizeAnnualReportYear
} from "@/lib/real-estate-annual-period";
import { getPortfolioAnnualQualityResults } from "@/lib/real-estate-annual-quality";
import { getPortfolioAnnualReportModel } from "@/lib/real-estate-annual-report";
import {
  sendSemiannualReportEmail,
  type SemiannualReportEmailPropertySummary,
  type SemiannualReportEmailSendResult,
  type SemiannualReportEmailSummary
} from "@/lib/real-estate-semiannual-report-email";
import type { PortfolioAnnualReportModel } from "@/lib/real-estate-annual-report";
import type { RealEstateAssetDetail } from "@/types/wealth";

export interface SemiannualReportPeriod {
  periodLabel: string;
  throughMonth: string;
  year: string;
}

export interface SemiannualReportTotals {
  blockingIssues: number;
  properties: number;
  ready: number;
  warnings: number;
}

export interface SemiannualRealEstateReportResult {
  dryRun: boolean;
  finishedAt: string;
  notification: SemiannualReportEmailSendResult;
  periodLabel: string;
  properties: SemiannualReportEmailPropertySummary[];
  reportUrl: string;
  requiresReview: boolean;
  startedAt: string;
  throughMonth: string;
  totals: SemiannualReportTotals;
  year: string;
}

interface SemiannualReportDependencies {
  loadProperties?: typeof getRealEstateAssetsWithCoverPhoto;
  sendEmail?: typeof sendSemiannualReportEmail;
}

export function getDefaultSemiannualReportPeriod(
  now = new Date()
): SemiannualReportPeriod {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  if (month < 7) {
    const reportYear = String(year - 1);

    return {
      periodLabel: reportYear,
      throughMonth: `${reportYear}-12`,
      year: reportYear
    };
  }

  const reportYear = String(year);

  return {
    periodLabel: `${reportYear} H1`,
    throughMonth: `${reportYear}-06`,
    year: reportYear
  };
}

export function normalizeSemiannualReportPeriod({
  now = new Date(),
  throughMonth,
  year
}: {
  now?: Date;
  throughMonth?: string;
  year?: string;
}): SemiannualReportPeriod {
  if (!year && !throughMonth) {
    return getDefaultSemiannualReportPeriod(now);
  }

  const normalizedYear = normalizeAnnualReportYear(
    year ?? throughMonth?.slice(0, 4) ?? ""
  );
  const normalizedThroughMonth =
    normalizeAnnualReportThroughMonth(throughMonth, normalizedYear) ??
    `${normalizedYear}-12`;
  const period = getAnnualReportPeriod({
    throughMonth: normalizedThroughMonth,
    year: normalizedYear
  });

  return {
    periodLabel: period.periodLabel,
    throughMonth: period.throughMonth ?? `${normalizedYear}-12`,
    year: period.year
  };
}

export function getSemiannualReportPath({
  throughMonth,
  year
}: {
  throughMonth: string;
  year: string;
}): string {
  const params = new URLSearchParams({ year });

  if (throughMonth !== `${year}-12`) {
    params.set("throughMonth", throughMonth);
  }

  return `/real-estate/annual-report?${params.toString()}`;
}

export function buildSemiannualReportUrl({
  appUrl,
  throughMonth,
  year
}: {
  appUrl: string;
  throughMonth: string;
  year: string;
}): string {
  const path = getSemiannualReportPath({ throughMonth, year });
  const baseUrl = appUrl.trim().replace(/\/+$/, "");

  return baseUrl ? `${baseUrl}${path}` : path;
}

function getAnnualQualityReviewDate(throughMonth: string): Date {
  const year = Number(throughMonth.slice(0, 4));
  const month = Number(throughMonth.slice(5, 7));

  return new Date(Date.UTC(year, month, 10, 14));
}

function getAnnualStatementDate(throughMonth: string): Date {
  const year = Number(throughMonth.slice(0, 4));
  const month = Number(throughMonth.slice(5, 7));

  return new Date(Date.UTC(year, month - 1, 15, 14));
}

function getPropertyStatus(
  scorecard: PortfolioAnnualReportModel["propertyScorecards"][number]
): SemiannualReportEmailPropertySummary["status"] {
  if (scorecard.blockingIssues.length > 0) {
    return "needs_review";
  }

  if (scorecard.warningIssues.length > 0) {
    return "warning";
  }

  return "ready";
}

function toEmailPropertySummary(
  scorecard: PortfolioAnnualReportModel["propertyScorecards"][number]
): SemiannualReportEmailPropertySummary {
  return {
    blockingIssues: scorecard.blockingIssues.map((issue) => ({ issue })),
    cashFlowAfterDebtService: scorecard.cashFlowAfterDebtService,
    expenseTransactionCount: scorecard.expenseTransactionCount,
    noi: scorecard.noi,
    operatingExpenses: scorecard.totalOperatingExpenses,
    propertyName: scorecard.propertyName,
    rentCollected: scorecard.rentCollected,
    status: getPropertyStatus(scorecard),
    warningIssues: scorecard.warningIssues.map((issue) => ({ issue }))
  };
}

function getSemiannualReportTotals(
  properties: SemiannualReportEmailPropertySummary[]
): SemiannualReportTotals {
  return {
    blockingIssues: properties.reduce(
      (total, property) => total + property.blockingIssues.length,
      0
    ),
    properties: properties.length,
    ready: properties.filter((property) => property.status === "ready").length,
    warnings: properties.reduce(
      (total, property) => total + property.warningIssues.length,
      0
    )
  };
}

function toEmailSummary({
  dryRun,
  report,
  reportUrl
}: {
  dryRun: boolean;
  report: PortfolioAnnualReportModel;
  reportUrl: string;
}): SemiannualReportEmailSummary {
  const properties = report.propertyScorecards.map(toEmailPropertySummary);

  return {
    dryRun,
    generatedAt: report.generatedAt,
    periodLabel: report.periodLabel,
    portfolio: {
      cashFlowAfterDebtService: report.statement.totalRow.cashFlowAfterDebtService,
      noi: report.statement.totalRow.noi,
      operatingExpenses: report.statement.totalRow.totalOperatingExpenses,
      propertyCount: report.statement.propertyRows.length,
      rentCollected: report.statement.totalRow.rentCollected,
      transactionCount: report.transactionSummary.totalCount
    },
    properties,
    reportUrl,
    requiresReview: report.status.blockingIssueCount > 0,
    throughMonth: report.throughMonth,
    year: report.year
  };
}

export async function runSemiannualRealEstateReport({
  dependencies = {},
  dryRun = false,
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  throughMonth,
  year
}: {
  dependencies?: SemiannualReportDependencies;
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  throughMonth?: string;
  year?: string;
} = {}): Promise<SemiannualRealEstateReportResult> {
  const startedAt = now.toISOString();
  const period = normalizeSemiannualReportPeriod({ now, throughMonth, year });
  const loadProperties =
    dependencies.loadProperties ?? getRealEstateAssetsWithCoverPhoto;
  const sendEmail = dependencies.sendEmail ?? sendSemiannualReportEmail;
  const properties: RealEstateAssetDetail[] = await loadProperties();
  const annualQualityResults = getPortfolioAnnualQualityResults(
    properties,
    period.year,
    getAnnualQualityReviewDate(period.throughMonth),
    period.throughMonth
  );
  const report = getPortfolioAnnualReportModel(
    properties,
    period.year,
    annualQualityResults,
    getAnnualStatementDate(period.throughMonth),
    period.throughMonth
  );
  const reportUrl = buildSemiannualReportUrl({
    appUrl: env.ASSETBOARD_APP_URL ?? "",
    throughMonth: period.throughMonth,
    year: period.year
  });
  const emailSummary = toEmailSummary({ dryRun, report, reportUrl });
  const notification = await sendEmail({
    env,
    fetchImpl,
    summary: emailSummary
  });
  const finishedAt = new Date().toISOString();

  return {
    dryRun,
    finishedAt,
    notification,
    periodLabel: report.periodLabel,
    properties: emailSummary.properties,
    reportUrl,
    requiresReview: emailSummary.requiresReview,
    startedAt,
    throughMonth: period.throughMonth,
    totals: getSemiannualReportTotals(emailSummary.properties),
    year: period.year
  };
}
