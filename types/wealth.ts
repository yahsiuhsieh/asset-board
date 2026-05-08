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

export type RealEstateRentalStatus = "rented" | "vacant";

export interface RealEstateAsset extends BaseAsset {
  type: "real-estate";
  address: string;
  rentalStatus: RealEstateRentalStatus;
  latitude?: number | null;
  longitude?: number | null;
  mapZoom: number;
  currentMarketValueSyncedAt?: string | null;
  county: string | null;
  purchasedAt: string | null;
  parcelNumber: string | null;
  purchasePrice: number;
  currentMarketValue: number;
  remainingMortgageBalance: number;
  monthlyRent: number;
  monthlyMortgage: number;
  buildingCost: number;
  landCost: number;
  totalDepreciation: number;
  rentCollectionMonth?: string | null;
  rentCollectedAmount: number;
  rentCollectedAt?: string | null;
  rentMatchTolerance: number;
  propertyTransactions?: RealEstatePropertyTransaction[];
}

export interface RealEstateBankConnection {
  id: string;
  assetId: string;
  provider: "plaid";
  providerItemId: string | null;
  accountId: string;
  accountName: string;
  accountType: string | null;
  accountSubtype: string | null;
  institutionName: string | null;
  institutionId: string | null;
  lastFour: string | null;
  status: "active" | "disconnected";
  connectedAt: string;
  lastSyncedAt: string | null;
}

export type RealEstateDataSource = "manual" | "chase";
export type ValuationProvider = "mock" | "provider";
export type RealEstateSource = RealEstateDataSource | ValuationProvider;

export type RealEstateBankTransactionDirection = "credit" | "debit";
export type RealEstateTransactionClassification =
  | "expense"
  | "rental_income"
  | "ignored";

export type RealEstateExpenseCategory =
  | "taxes"
  | "insurance"
  | "maintenance"
  | "hoa"
  | "utilities"
  | "other";

export interface RealEstatePropertyTransaction {
  id: string;
  assetId: string;
  bankConnectionId: string | null;
  provider: "mock" | "plaid" | "legacy_bank";
  providerTransactionId: string;
  accountId: string;
  accountName: string;
  postedAt: string;
  description: string;
  memo: string | null;
  amount: number;
  direction: RealEstateBankTransactionDirection;
  classification: RealEstateTransactionClassification | null;
  category: RealEstateExpenseCategory | null;
  rentPeriodMonth: string | null;
  note: string | null;
}

export type RealEstateMonthlyReviewStatus = "ready" | "needs_review";

export interface RealEstateMonthlyReview {
  id: string;
  assetId: string;
  reviewMonth: string;
  rentStatus: RealEstateMonthlyReviewStatus;
  expenseStatus: RealEstateMonthlyReviewStatus;
  closedAt: string | null;
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
  | "monthly_mortgage";

export interface RealEstateMetricSnapshot {
  id: string;
  assetId: string;
  metricType: RealEstateMetricType;
  value: number;
  recordedAt: string;
  source: RealEstateSource;
  note: string | null;
}

export interface RealEstateAssetDetail extends RealEstateAsset {
  photos: RealEstatePhoto[];
  snapshots: RealEstateMetricSnapshot[];
  propertyTransactions: RealEstatePropertyTransaction[];
  bankConnections: RealEstateBankConnection[];
  monthlyReviews: RealEstateMonthlyReview[];
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
