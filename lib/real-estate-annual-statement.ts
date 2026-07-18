import { getTransactionNoteCsvValue } from "@/lib/real-estate-transaction-notes";
import {
  isMonthInAnnualReportPeriod,
  normalizeAnnualReportThroughMonth
} from "@/lib/real-estate-annual-period";
import type {
  RealEstateAssetDetail,
  RealEstateExpenseCategory,
  RealEstatePropertyTransaction,
  RealEstateRentalStatus
} from "@/types/wealth";

export type RealEstateAnnualStatementRentalStatus =
  | RealEstateRentalStatus
  | "Portfolio";

export interface RealEstateAnnualStatementRow {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  rentalStatus: RealEstateAnnualStatementRentalStatus;
  rentCollected: number;
  taxes: number;
  insurance: number;
  maintenance: number;
  hoa: number;
  utilities: number;
  other: number;
  totalOperatingExpenses: number;
  noi: number;
  scheduledDebtService: number;
  cashFlowAfterDebtService: number;
  cashInvested: number;
  cashOnCashReturn: number | null;
  expenseRatio: number | null;
  blockingIssueCount: number;
  warningIssueCount: number;
}

export interface AnnualStatementQualityCounts {
  propertyId: string;
  blockingIssues: unknown[];
  warningIssues: unknown[];
}

export interface RealEstateAnnualStatement {
  propertyRows: RealEstateAnnualStatementRow[];
  totalRow: RealEstateAnnualStatementRow;
}

export interface RealEstateAnnualReportTransactionRow {
  date: string;
  type: "rental_income" | "expense";
  category: string;
  description: string;
  note: string;
  account: string;
  amount: number;
  propertyName: string;
  propertyAddress: string;
}

export const annualStatementExpenseCategories: RealEstateExpenseCategory[] = [
  "taxes",
  "insurance",
  "maintenance",
  "hoa",
  "utilities",
  "other"
];

const portfolioAnnualStatementCsvHeaders = [
  "property name",
  "property address",
  "rental status",
  "rent collected",
  "taxes",
  "insurance",
  "maintenance",
  "HOA",
  "utilities",
  "other",
  "total operating expenses",
  "NOI",
  "scheduled debt service",
  "cash flow after debt service",
  "cash invested",
  "cash-on-cash return",
  "expense ratio",
  "blocking issue count",
  "warning issue count"
] as const;

const portfolioAnnualReportTransactionCsvHeaders = [
  "date",
  "type",
  "category",
  "description",
  "note",
  "account",
  "amount",
  "property name",
  "property address"
] as const;

const annualReportCsvColumnCount = 19;

function getCurrentYearMonth(today = new Date()): { year: number; month: number } {
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1
  };
}

function getTransactionYear(transaction: RealEstatePropertyTransaction): string {
  return transaction.postedAt.slice(0, 4);
}

export function getAnnualStatementMonthCount(
  property: RealEstateAssetDetail,
  year: string,
  today = new Date(),
  throughMonth?: string | null
): number {
  const numericYear = Number(year);
  const current = getCurrentYearMonth(today);
  const normalizedThroughMonth = normalizeAnnualReportThroughMonth(
    throughMonth,
    year
  );

  if (
    !Number.isInteger(numericYear) ||
    (numericYear > current.year && !normalizedThroughMonth)
  ) {
    return 0;
  }

  const endMonth = normalizedThroughMonth
    ? Number(normalizedThroughMonth.slice(5, 7))
    : numericYear === current.year
      ? current.month
      : 12;
  let startMonth = 1;

  if (property.purchasedAt) {
    const purchasedYear = Number(property.purchasedAt.slice(0, 4));
    const purchasedMonth = Number(property.purchasedAt.slice(5, 7));

    if (Number.isInteger(purchasedYear) && purchasedYear > numericYear) {
      return 0;
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
    return 0;
  }

  return endMonth - startMonth + 1;
}

function getAnnualTransactions(
  property: RealEstateAssetDetail,
  year: string,
  throughMonth?: string | null
): RealEstatePropertyTransaction[] {
  return property.propertyTransactions.filter(
    (transaction) =>
      getTransactionYear(transaction) === year &&
      isMonthInAnnualReportPeriod({
        month: transaction.postedAt,
        throughMonth,
        year
      })
  );
}

function getQualityCounts(
  qualityResults: AnnualStatementQualityCounts[],
  propertyId: string
): { blockingIssueCount: number; warningIssueCount: number } {
  const result = qualityResults.find((qualityResult) => qualityResult.propertyId === propertyId);

  return {
    blockingIssueCount: result?.blockingIssues.length ?? 0,
    warningIssueCount: result?.warningIssues.length ?? 0
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function getExpenseRatio(
  totalOperatingExpenses: number,
  rentCollected: number
): number | null {
  if (rentCollected <= 0) {
    return null;
  }

  return totalOperatingExpenses / rentCollected;
}

function getCashOnCashReturn(
  cashFlowAfterDebtService: number,
  cashInvested: number
): number | null {
  if (cashInvested <= 0) {
    return null;
  }

  return cashFlowAfterDebtService / cashInvested;
}

export function getPortfolioAnnualStatement(
  properties: RealEstateAssetDetail[],
  year: string,
  qualityResults: AnnualStatementQualityCounts[] = [],
  today = new Date(),
  throughMonth?: string | null
): RealEstateAnnualStatement {
  const normalizedThroughMonth = normalizeAnnualReportThroughMonth(
    throughMonth,
    year
  );
  const propertyRows = properties.map((property) => {
    const annualTransactions = getAnnualTransactions(
      property,
      year,
      normalizedThroughMonth
    );
    const categoryTotals = Object.fromEntries(
      annualStatementExpenseCategories.map((category) => [category, 0])
    ) as Record<RealEstateExpenseCategory, number>;
    const rentCollected = sum(
      annualTransactions
        .filter(
          (transaction) =>
            transaction.classification === "rental_income" &&
            transaction.direction === "credit"
        )
        .map((transaction) => Math.abs(transaction.amount))
    );

    for (const transaction of annualTransactions) {
      if (transaction.classification !== "expense" || transaction.direction !== "debit") {
        continue;
      }

      categoryTotals[transaction.category ?? "other"] += Math.abs(transaction.amount);
    }

    const totalOperatingExpenses = sum(
      annualStatementExpenseCategories.map((category) => categoryTotals[category])
    );
    const noi = rentCollected - totalOperatingExpenses;
    const scheduledDebtService =
      property.monthlyMortgage *
      getAnnualStatementMonthCount(property, year, today, normalizedThroughMonth);
    const cashFlowAfterDebtService = noi - scheduledDebtService;
    const cashInvested = property.cashInvested ?? 0;
    const { blockingIssueCount, warningIssueCount } = getQualityCounts(
      qualityResults,
      property.id
    );

    return {
      propertyId: property.id,
      propertyName: property.name,
      propertyAddress: property.address,
      rentalStatus: property.rentalStatus,
      rentCollected,
      taxes: categoryTotals.taxes,
      insurance: categoryTotals.insurance,
      maintenance: categoryTotals.maintenance,
      hoa: categoryTotals.hoa,
      utilities: categoryTotals.utilities,
      other: categoryTotals.other,
      totalOperatingExpenses,
      noi,
      scheduledDebtService,
      cashFlowAfterDebtService,
      cashInvested,
      cashOnCashReturn: getCashOnCashReturn(
        cashFlowAfterDebtService,
        cashInvested
      ),
      expenseRatio: getExpenseRatio(totalOperatingExpenses, rentCollected),
      blockingIssueCount,
      warningIssueCount
    };
  });

  const totalRentCollected = sum(propertyRows.map((row) => row.rentCollected));
  const totalOperatingExpenses = sum(
    propertyRows.map((row) => row.totalOperatingExpenses)
  );
  const totalNoi = totalRentCollected - totalOperatingExpenses;
  const totalScheduledDebtService = sum(
    propertyRows.map((row) => row.scheduledDebtService)
  );
  const totalCashInvested = sum(propertyRows.map((row) => row.cashInvested));
  const totalRow: RealEstateAnnualStatementRow = {
    propertyId: "portfolio-total",
    propertyName: "Portfolio Total",
    propertyAddress: "",
    rentalStatus: "Portfolio",
    rentCollected: totalRentCollected,
    taxes: sum(propertyRows.map((row) => row.taxes)),
    insurance: sum(propertyRows.map((row) => row.insurance)),
    maintenance: sum(propertyRows.map((row) => row.maintenance)),
    hoa: sum(propertyRows.map((row) => row.hoa)),
    utilities: sum(propertyRows.map((row) => row.utilities)),
    other: sum(propertyRows.map((row) => row.other)),
    totalOperatingExpenses,
    noi: totalNoi,
    scheduledDebtService: totalScheduledDebtService,
    cashFlowAfterDebtService: totalNoi - totalScheduledDebtService,
    cashInvested: totalCashInvested,
    cashOnCashReturn: getCashOnCashReturn(
      totalNoi - totalScheduledDebtService,
      totalCashInvested
    ),
    expenseRatio: getExpenseRatio(totalOperatingExpenses, totalRentCollected),
    blockingIssueCount: sum(propertyRows.map((row) => row.blockingIssueCount)),
    warningIssueCount: sum(propertyRows.map((row) => row.warningIssueCount))
  };

  return {
    propertyRows,
    totalRow
  };
}

function escapeCsvField(value: string | number): string {
  const field = String(value);

  if (!/[",\r\n]/.test(field)) {
    return field;
  }

  return `"${field.replace(/"/g, '""')}"`;
}

function formatCurrencyCsvValue(value: number): string {
  return value.toFixed(2);
}

function formatPercentCsvValue(value: number | null): string {
  return value == null ? "" : `${(value * 100).toFixed(2)}%`;
}

function getStatementCsvRow(row: RealEstateAnnualStatementRow): Array<string | number> {
  return [
    row.propertyName,
    row.propertyAddress,
    row.rentalStatus,
    formatCurrencyCsvValue(row.rentCollected),
    formatCurrencyCsvValue(row.taxes),
    formatCurrencyCsvValue(row.insurance),
    formatCurrencyCsvValue(row.maintenance),
    formatCurrencyCsvValue(row.hoa),
    formatCurrencyCsvValue(row.utilities),
    formatCurrencyCsvValue(row.other),
    formatCurrencyCsvValue(row.totalOperatingExpenses),
    formatCurrencyCsvValue(row.noi),
    formatCurrencyCsvValue(row.scheduledDebtService),
    formatCurrencyCsvValue(row.cashFlowAfterDebtService),
    formatCurrencyCsvValue(row.cashInvested),
    formatPercentCsvValue(row.cashOnCashReturn),
    formatPercentCsvValue(row.expenseRatio),
    row.blockingIssueCount,
    row.warningIssueCount
  ];
}

function getStatementMetricCsvFields(
  row: RealEstateAnnualStatementRow
): Array<string | number> {
  return [
    formatCurrencyCsvValue(row.rentCollected),
    formatCurrencyCsvValue(row.taxes),
    formatCurrencyCsvValue(row.insurance),
    formatCurrencyCsvValue(row.maintenance),
    formatCurrencyCsvValue(row.hoa),
    formatCurrencyCsvValue(row.utilities),
    formatCurrencyCsvValue(row.other),
    formatCurrencyCsvValue(row.totalOperatingExpenses),
    formatCurrencyCsvValue(row.noi),
    formatCurrencyCsvValue(row.scheduledDebtService),
    formatCurrencyCsvValue(row.cashFlowAfterDebtService),
    formatCurrencyCsvValue(row.cashInvested),
    formatPercentCsvValue(row.cashOnCashReturn),
    formatPercentCsvValue(row.expenseRatio),
    row.blockingIssueCount,
    row.warningIssueCount
  ];
}

function padAnnualReportCsvRow(
  row: Array<string | number>
): Array<string | number> {
  return [
    ...row,
    ...Array(Math.max(annualReportCsvColumnCount - row.length, 0)).fill("")
  ];
}

function getAnnualReportBlankCsvRow(): Array<string | number> {
  return Array(annualReportCsvColumnCount).fill("");
}

function getAnnualReportSectionTitleCsvRow(title: string): Array<string | number> {
  return padAnnualReportCsvRow([title]);
}

function getPortfolioSummaryCsvHeaderRow(): Array<string | number> {
  return padAnnualReportCsvRow(["", ...portfolioAnnualStatementCsvHeaders.slice(3)]);
}

function getPortfolioSummaryCsvRow(
  row: RealEstateAnnualStatementRow
): Array<string | number> {
  return padAnnualReportCsvRow(["total", ...getStatementMetricCsvFields(row)]);
}

function getPropertySummaryCsvHeaderRow(): Array<string | number> {
  return [
    "",
    "property address",
    "rental status",
    ...portfolioAnnualStatementCsvHeaders.slice(3)
  ];
}

function getPropertySummaryCsvRow(
  row: RealEstateAnnualStatementRow
): Array<string | number> {
  return [
    row.propertyName,
    row.propertyAddress,
    row.rentalStatus,
    ...getStatementMetricCsvFields(row)
  ];
}

function getTransactionAppendixCsvRow(
  row: RealEstateAnnualReportTransactionRow
): Array<string | number> {
  return padAnnualReportCsvRow([
    row.date,
    row.type,
    row.category,
    row.description,
    getTransactionNoteCsvValue(row.note),
    row.account,
    formatCurrencyCsvValue(row.amount),
    row.propertyName,
    row.propertyAddress
  ]);
}

function serializeCsvRows(
  csvRows: ReadonlyArray<ReadonlyArray<string | number>>
): string {
  return `${csvRows
    .map((row) => row.map((field) => escapeCsvField(field)).join(","))
    .join("\r\n")}\r\n`;
}

export function serializePortfolioAnnualStatementCsv(
  statement: RealEstateAnnualStatement
): string {
  const csvRows = [
    portfolioAnnualStatementCsvHeaders,
    getStatementCsvRow(statement.totalRow),
    ...statement.propertyRows.map(getStatementCsvRow)
  ];

  return serializeCsvRows(csvRows);
}

export function serializePortfolioAnnualReportCsv(
  statement: RealEstateAnnualStatement,
  transactionRows: RealEstateAnnualReportTransactionRow[]
): string {
  const csvRows = [
    getAnnualReportBlankCsvRow(),
    getAnnualReportSectionTitleCsvRow("Portfolio Summary"),
    getPortfolioSummaryCsvHeaderRow(),
    getPortfolioSummaryCsvRow(statement.totalRow),
    getAnnualReportBlankCsvRow(),
    getAnnualReportSectionTitleCsvRow("Property Summary"),
    getPropertySummaryCsvHeaderRow(),
    ...statement.propertyRows.map(getPropertySummaryCsvRow),
    getAnnualReportBlankCsvRow(),
    getAnnualReportSectionTitleCsvRow("Transaction Appendix"),
    padAnnualReportCsvRow([...portfolioAnnualReportTransactionCsvHeaders]),
    ...transactionRows.map(getTransactionAppendixCsvRow)
  ];

  return serializeCsvRows(csvRows);
}

export function getPortfolioAnnualReportFilename(year: string): string {
  return `assetboard-real-estate-${year}-annual-report.csv`;
}
