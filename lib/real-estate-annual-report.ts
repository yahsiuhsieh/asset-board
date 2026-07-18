import {
  annualStatementExpenseCategories,
  getAnnualStatementMonthCount,
  getPortfolioAnnualStatement,
  type RealEstateAnnualStatement,
  type RealEstateAnnualStatementRow
} from "@/lib/real-estate-annual-statement";
import {
  getPortfolioAnnualExportRows,
  type PortfolioAnnualTransactionExportRow
} from "@/lib/real-estate-transaction-export";
import {
  isHardBlockingAnnualQualityIssue,
  type AnnualQualityIssue,
  type PropertyAnnualQualityResult
} from "@/lib/real-estate-annual-quality";
import type {
  RealEstateAssetDetail,
  RealEstateExpenseCategory,
  RealEstatePropertyTransaction
} from "@/types/wealth";

export const annualReportTransactionPreviewLimit = 25;

export interface AnnualReportStatus {
  label: "Ready" | "Ready With Warnings" | "Needs Review" | "Blocked";
  tone: "positive" | "warning" | "negative";
  blockingIssueCount: number;
  warningIssueCount: number;
  hardBlockingIssueCount: number;
  issuePropertyCount: number;
}

export interface AnnualReportPortfolioSummary {
  propertyCount: number;
  currentValue: number;
  mortgageBalance: number;
  equity: number;
  purchasePrice: number;
  cashInvested: number;
  monthlyRent: number;
  monthlyMortgage: number;
}

export interface AnnualReportExpenseCategoryRow {
  category: RealEstateExpenseCategory;
  label: string;
  amount: number;
  shareOfExpenses: number | null;
  transactionCount: number;
}

export interface AnnualReportPropertyScorecard {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  rentalStatus: RealEstateAnnualStatementRow["rentalStatus"];
  county: string | null;
  parcelNumber: string | null;
  purchasedAt: string | null;
  purchasePrice: number;
  cashInvested: number;
  currentValue: number;
  mortgageBalance: number;
  equity: number;
  monthlyRent: number;
  monthlyMortgage: number;
  reportMonthCount: number;
  expectedRent: number;
  rentCollected: number;
  rentVariance: number;
  rentCollectionRate: number | null;
  totalOperatingExpenses: number;
  noi: number;
  scheduledDebtService: number;
  cashFlowAfterDebtService: number;
  cashOnCashReturn: number | null;
  expenseRatio: number | null;
  transactionCount: number;
  rentalIncomeTransactionCount: number;
  expenseTransactionCount: number;
  blockingIssues: AnnualQualityIssue[];
  warningIssues: AnnualQualityIssue[];
}

export interface AnnualReportTransactionSummary {
  totalCount: number;
  rentalIncomeCount: number;
  expenseCount: number;
  previewLimit: number;
  previewRows: PortfolioAnnualTransactionExportRow[];
}

export interface PortfolioAnnualReportModel {
  year: string;
  generatedAt: string;
  portfolio: AnnualReportPortfolioSummary;
  status: AnnualReportStatus;
  statement: RealEstateAnnualStatement;
  expenseCategoryRows: AnnualReportExpenseCategoryRow[];
  propertyScorecards: AnnualReportPropertyScorecard[];
  propertyComparisonRows: RealEstateAnnualStatementRow[];
  annualQualityResults: PropertyAnnualQualityResult[];
  transactionRows: PortfolioAnnualTransactionExportRow[];
  transactionSummary: AnnualReportTransactionSummary;
}

const expenseCategoryLabels: Record<RealEstateExpenseCategory, string> = {
  taxes: "Taxes",
  insurance: "Insurance",
  maintenance: "Maintenance",
  hoa: "HOA",
  utilities: "Utilities",
  other: "Other"
};

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function getTransactionYear(transaction: RealEstatePropertyTransaction): string {
  return transaction.postedAt.slice(0, 4);
}

function getAnnualTransactions(
  property: RealEstateAssetDetail,
  year: string
): RealEstatePropertyTransaction[] {
  return property.propertyTransactions.filter(
    (transaction) => getTransactionYear(transaction) === year
  );
}

function getQualityResult(
  annualQualityResults: PropertyAnnualQualityResult[],
  propertyId: string
): PropertyAnnualQualityResult | null {
  return (
    annualQualityResults.find((result) => result.propertyId === propertyId) ?? null
  );
}

function getHardBlockingIssueCount(
  annualQualityResults: PropertyAnnualQualityResult[]
): number {
  return annualQualityResults.reduce(
    (total, result) =>
      total +
      result.blockingIssues.filter(isHardBlockingAnnualQualityIssue).length,
    0
  );
}

function getAnnualReportStatus(
  annualQualityResults: PropertyAnnualQualityResult[]
): AnnualReportStatus {
  const blockingIssueCount = sum(
    annualQualityResults.map((result) => result.blockingIssues.length)
  );
  const warningIssueCount = sum(
    annualQualityResults.map((result) => result.warningIssues.length)
  );
  const hardBlockingIssueCount = getHardBlockingIssueCount(annualQualityResults);
  const issuePropertyCount = annualQualityResults.filter(
    (result) => result.issues.length > 0
  ).length;

  if (hardBlockingIssueCount > 0) {
    return {
      label: "Blocked",
      tone: "negative",
      blockingIssueCount,
      warningIssueCount,
      hardBlockingIssueCount,
      issuePropertyCount
    };
  }

  if (blockingIssueCount > 0) {
    return {
      label: "Needs Review",
      tone: "warning",
      blockingIssueCount,
      warningIssueCount,
      hardBlockingIssueCount,
      issuePropertyCount
    };
  }

  if (warningIssueCount > 0) {
    return {
      label: "Ready With Warnings",
      tone: "warning",
      blockingIssueCount,
      warningIssueCount,
      hardBlockingIssueCount,
      issuePropertyCount
    };
  }

  return {
    label: "Ready",
    tone: "positive",
    blockingIssueCount,
    warningIssueCount,
    hardBlockingIssueCount,
    issuePropertyCount
  };
}

function getPortfolioSummary(
  properties: RealEstateAssetDetail[]
): AnnualReportPortfolioSummary {
  const currentValue = sum(properties.map((property) => property.currentMarketValue));
  const mortgageBalance = sum(
    properties.map((property) => property.remainingMortgageBalance)
  );

  return {
    propertyCount: properties.length,
    currentValue,
    mortgageBalance,
    equity: currentValue - mortgageBalance,
    purchasePrice: sum(properties.map((property) => property.purchasePrice)),
    cashInvested: sum(properties.map((property) => property.cashInvested ?? 0)),
    monthlyRent: sum(properties.map((property) => property.monthlyRent)),
    monthlyMortgage: sum(properties.map((property) => property.monthlyMortgage))
  };
}

function getExpenseCategoryRows(
  statement: RealEstateAnnualStatement,
  transactionRows: PortfolioAnnualTransactionExportRow[]
): AnnualReportExpenseCategoryRow[] {
  return annualStatementExpenseCategories.map((category) => {
    const amount = statement.totalRow[category];

    return {
      category,
      label: expenseCategoryLabels[category],
      amount,
      shareOfExpenses:
        statement.totalRow.totalOperatingExpenses > 0
          ? amount / statement.totalRow.totalOperatingExpenses
          : null,
      transactionCount: transactionRows.filter(
        (transaction) =>
          transaction.type === "expense" && transaction.category === category
      ).length
    };
  });
}

function getTransactionSummary(
  transactionRows: PortfolioAnnualTransactionExportRow[]
): AnnualReportTransactionSummary {
  return {
    totalCount: transactionRows.length,
    rentalIncomeCount: transactionRows.filter(
      (transaction) => transaction.type === "rental_income"
    ).length,
    expenseCount: transactionRows.filter(
      (transaction) => transaction.type === "expense"
    ).length,
    previewLimit: annualReportTransactionPreviewLimit,
    previewRows: transactionRows.slice(0, annualReportTransactionPreviewLimit)
  };
}

function getPropertyScorecards(
  properties: RealEstateAssetDetail[],
  statement: RealEstateAnnualStatement,
  transactionRows: PortfolioAnnualTransactionExportRow[],
  annualQualityResults: PropertyAnnualQualityResult[],
  year: string,
  generatedAt: Date
): AnnualReportPropertyScorecard[] {
  const propertiesById = new Map(
    properties.map((property) => [property.id, property])
  );

  return statement.propertyRows.map((row) => {
    const property = propertiesById.get(row.propertyId);

    if (!property) {
      throw new Error(`Missing annual report property ${row.propertyId}.`);
    }

    const annualTransactions = getAnnualTransactions(property, year);
    const reportMonthCount = getAnnualStatementMonthCount(
      property,
      year,
      generatedAt
    );
    const expectedRent = property.monthlyRent * reportMonthCount;
    const qualityResult = getQualityResult(annualQualityResults, property.id);
    const propertyTransactionRows = transactionRows.filter(
      (transaction) => transaction.propertyId === property.id
    );

    return {
      propertyId: property.id,
      propertyName: property.name,
      propertyAddress: property.address,
      rentalStatus: row.rentalStatus,
      county: property.county,
      parcelNumber: property.parcelNumber,
      purchasedAt: property.purchasedAt,
      purchasePrice: property.purchasePrice,
      cashInvested: row.cashInvested,
      currentValue: property.currentMarketValue,
      mortgageBalance: property.remainingMortgageBalance,
      equity: property.currentMarketValue - property.remainingMortgageBalance,
      monthlyRent: property.monthlyRent,
      monthlyMortgage: property.monthlyMortgage,
      reportMonthCount,
      expectedRent,
      rentCollected: row.rentCollected,
      rentVariance: row.rentCollected - expectedRent,
      rentCollectionRate: expectedRent > 0 ? row.rentCollected / expectedRent : null,
      totalOperatingExpenses: row.totalOperatingExpenses,
      noi: row.noi,
      scheduledDebtService: row.scheduledDebtService,
      cashFlowAfterDebtService: row.cashFlowAfterDebtService,
      cashOnCashReturn: row.cashOnCashReturn,
      expenseRatio: row.expenseRatio,
      transactionCount: annualTransactions.length,
      rentalIncomeTransactionCount: propertyTransactionRows.filter(
        (transaction) => transaction.type === "rental_income"
      ).length,
      expenseTransactionCount: propertyTransactionRows.filter(
        (transaction) => transaction.type === "expense"
      ).length,
      blockingIssues: qualityResult?.blockingIssues ?? [],
      warningIssues: qualityResult?.warningIssues ?? []
    };
  });
}

export function getPortfolioAnnualReportModel(
  properties: RealEstateAssetDetail[],
  year: string,
  annualQualityResults: PropertyAnnualQualityResult[],
  generatedAt = new Date()
): PortfolioAnnualReportModel {
  const statement = getPortfolioAnnualStatement(
    properties,
    year,
    annualQualityResults,
    generatedAt
  );
  const transactionRows = getPortfolioAnnualExportRows(properties, year);

  return {
    year,
    generatedAt: generatedAt.toISOString(),
    portfolio: getPortfolioSummary(properties),
    status: getAnnualReportStatus(annualQualityResults),
    statement,
    expenseCategoryRows: getExpenseCategoryRows(statement, transactionRows),
    propertyScorecards: getPropertyScorecards(
      properties,
      statement,
      transactionRows,
      annualQualityResults,
      year,
      generatedAt
    ),
    propertyComparisonRows: statement.propertyRows,
    annualQualityResults,
    transactionRows,
    transactionSummary: getTransactionSummary(transactionRows)
  };
}
