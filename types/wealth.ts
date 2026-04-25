import type { LucideIcon } from "lucide-react";

export type AssetType = "stock" | "crypto" | "real-estate" | "car" | "cash";

export interface BaseAsset {
  id: string;
  name: string;
  type: AssetType;
  value: number;
}

export interface StockAsset extends BaseAsset {
  type: "stock";
  ticker: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
}

export interface CryptoAsset extends BaseAsset {
  type: "crypto";
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
}

export interface RealEstateAsset extends BaseAsset {
  type: "real-estate";
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  mapZoom: number;
  currentMarketValueSource: RealEstateDataSource;
  currentMarketValueSyncedAt?: string | null;
  monthlyRentSource: RealEstateDataSource;
  monthlyRentSyncedAt?: string | null;
  purchasePrice: number;
  currentMarketValue: number;
  remainingMortgageBalance: number;
  monthlyRent: number;
  monthlyMortgage: number;
  annualExpenses: number;
  annualTaxes: number;
  annualInsurance: number;
  annualMaintenance: number;
  expenseItems?: RealEstateExpenseItem[];
}

export type RealEstateDataSource = "manual" | "zillow" | "chase";

export type ExpenseFrequency = "monthly" | "quarterly" | "semiannual" | "annual";

export type RealEstateExpenseCategory =
  | "taxes"
  | "insurance"
  | "maintenance"
  | "hoa"
  | "utilities"
  | "other";

export interface RealEstateExpenseItem {
  id: string;
  assetId: string;
  name: string;
  category: RealEstateExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  paidMonth: number | null;
  note: string | null;
}

export interface RealEstatePhoto {
  id: string;
  assetId: string;
  storagePath: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  signedUrl: string | null;
}

export type RealEstateMetricType =
  | "current_market_value"
  | "monthly_rent"
  | "remaining_mortgage_balance"
  | "monthly_mortgage"
  | "annual_taxes"
  | "annual_insurance"
  | "annual_maintenance"
  | "annual_expenses";

export interface RealEstateMetricSnapshot {
  id: string;
  assetId: string;
  metricType: RealEstateMetricType;
  value: number;
  recordedAt: string;
  source: RealEstateDataSource;
  note: string | null;
}

export interface RealEstateAssetDetail extends RealEstateAsset {
  photos: RealEstatePhoto[];
  snapshots: RealEstateMetricSnapshot[];
  expenseItems: RealEstateExpenseItem[];
}

export interface CarAsset extends BaseAsset {
  type: "car";
  make: string;
  model: string;
  year: number;
  loanBalance?: number;
}

export interface CashAsset extends BaseAsset {
  type: "cash";
  institution: string;
  accountMask?: string;
}

export type Asset =
  | StockAsset
  | CryptoAsset
  | RealEstateAsset
  | CarAsset
  | CashAsset;

export interface SummaryCardMetric {
  id: string;
  title: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "positive" | "warning";
}
