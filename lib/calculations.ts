import {
  getRecordedExpensesForMonth,
  getYtdAverageMonthlyExpenses
} from "@/lib/real-estate-expenses";
import type { Asset, RealEstateAsset } from "@/types/wealth";

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

export function calculatePropertyROI(property: RealEstateAsset): number {
  if (property.purchasePrice <= 0) {
    return 0;
  }

  return calculateAnnualNOI(property) / property.purchasePrice;
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

export function calculateTotalNetWorth(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + asset.value, 0);
}

export function calculateRealEstatePortfolioROI(properties: RealEstateAsset[]): number {
  const totalPurchasePrice = properties.reduce(
    (total, property) => total + property.purchasePrice,
    0
  );

  if (totalPurchasePrice <= 0) {
    return 0;
  }

  const annualNetIncome = properties.reduce(
    (total, property) => total + calculateAnnualNOI(property),
    0
  );

  return annualNetIncome / totalPurchasePrice;
}
