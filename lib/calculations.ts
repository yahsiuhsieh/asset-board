import {
  getRecordedExpensesForMonth,
  getYtdAverageMonthlyExpenses
} from "@/lib/real-estate-expenses";
import type {
  Asset,
  RealEstateAsset,
  RealEstatePropertyTransaction
} from "@/types/wealth";

export function getMonthlyOperatingExpenses(
  property: RealEstateAsset,
  month?: string
): number {
  return getRecordedExpensesForMonth(property.propertyTransactions, month);
}

export function getYtdAverageMonthlyOperatingExpenses(
  property: RealEstateAsset,
  month?: string
): number {
  return getYtdAverageMonthlyExpenses(property.propertyTransactions, month);
}

export function calculateMonthlyNetCashFlow(property: RealEstateAsset): number {
  return property.monthlyRent - (property.monthlyMortgage + getMonthlyOperatingExpenses(property));
}

export function calculateMonthlyNOI(property: RealEstateAsset): number {
  return property.monthlyRent - getMonthlyOperatingExpenses(property);
}

export function calculateAnnualNOI(property: RealEstateAsset): number {
  return (
    property.monthlyRent - getYtdAverageMonthlyOperatingExpenses(property)
  ) * 12;
}

export function calculateCapRate(property: RealEstateAsset): number {
  if (property.currentMarketValue <= 0) {
    return 0;
  }

  return calculateAnnualNOI(property) / property.currentMarketValue;
}

export function calculateExpenseRatio(property: RealEstateAsset): number {
  if (property.monthlyRent <= 0) {
    return 0;
  }

  return getYtdAverageMonthlyOperatingExpenses(property) / property.monthlyRent;
}

export function calculatePropertyEquity(property: RealEstateAsset): number {
  return property.currentMarketValue - property.remainingMortgageBalance;
}

export function calculateAnnualCashFlowAfterDebtService(
  property: RealEstateAsset
): number {
  return calculateAnnualNOI(property) - property.monthlyMortgage * 12;
}

export function calculateCashOnCashReturn(
  property: RealEstateAsset
): number | null {
  if (property.cashInvested <= 0) {
    return null;
  }

  return calculateAnnualCashFlowAfterDebtService(property) / property.cashInvested;
}

function getCurrentYearMonth(today = new Date()): { year: number; month: number } {
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1
  };
}

function getYearMonth(value: string): { year: number; month: number } | null {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

export function getElapsedMonthsSincePurchase(
  purchasedAt: string | null,
  today = new Date()
): number | null {
  if (!purchasedAt) {
    return null;
  }

  const purchased = getYearMonth(purchasedAt);

  if (!purchased) {
    return null;
  }

  const current = getCurrentYearMonth(today);
  const elapsedMonths =
    (current.year - purchased.year) * 12 + current.month - purchased.month + 1;

  return Math.max(elapsedMonths, 0);
}

function getTransactionCashFlow(
  transaction: RealEstatePropertyTransaction
): number {
  if (
    transaction.classification === "rental_income" &&
    transaction.direction === "credit"
  ) {
    return Math.abs(transaction.amount);
  }

  if (transaction.classification === "expense" && transaction.direction === "debit") {
    return -Math.abs(transaction.amount);
  }

  return 0;
}

export function getCumulativeCashFlowAfterDebtService(
  property: RealEstateAsset,
  today = new Date()
): number | null {
  const elapsedMonths = getElapsedMonthsSincePurchase(property.purchasedAt, today);

  if (elapsedMonths == null) {
    return null;
  }

  const ledgerCashFlow = (property.propertyTransactions ?? [])
    .filter((transaction) => transaction.postedAt >= property.purchasedAt!)
    .reduce((total, transaction) => total + getTransactionCashFlow(transaction), 0);

  return ledgerCashFlow - property.monthlyMortgage * elapsedMonths;
}

export function calculateTotalReturnSincePurchaseAmount(
  property: RealEstateAsset,
  today = new Date()
): number | null {
  if (property.cashInvested <= 0 || !property.purchasedAt) {
    return null;
  }

  const cumulativeCashFlow = getCumulativeCashFlowAfterDebtService(property, today);

  if (cumulativeCashFlow == null) {
    return null;
  }

  return calculatePropertyEquity(property) + cumulativeCashFlow - property.cashInvested;
}

export function calculateTotalReturnSincePurchase(
  property: RealEstateAsset,
  today = new Date()
): number | null {
  const totalReturnAmount = calculateTotalReturnSincePurchaseAmount(property, today);

  if (totalReturnAmount == null || property.cashInvested <= 0) {
    return null;
  }

  return totalReturnAmount / property.cashInvested;
}

export function calculateTotalNetWorth(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + asset.value, 0);
}
