import type { Asset, RealEstateAsset } from "@/types/wealth";

export function calculatePropertyROI(property: RealEstateAsset): number {
  if (property.purchasePrice <= 0) {
    return 0;
  }

  return (
    (property.monthlyRent * 12 - property.annualExpenses - property.annualTaxes) /
    property.purchasePrice
  );
}

export function calculateMonthlyNetCashFlow(property: RealEstateAsset): number {
  return (
    property.monthlyRent -
    (property.monthlyMortgage +
      property.annualTaxes / 12 +
      property.annualInsurance / 12 +
      property.annualMaintenance / 12)
  );
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
    (total, property) =>
      total +
      property.monthlyRent * 12 -
      property.annualExpenses -
      property.annualTaxes,
    0
  );

  return annualNetIncome / totalPurchasePrice;
}
