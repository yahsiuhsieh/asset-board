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
  purchasePrice: number;
  currentMarketValue: number;
  remainingMortgageBalance: number;
  monthlyRent: number;
  monthlyMortgage: number;
  annualExpenses: number;
  annualTaxes: number;
  annualInsurance: number;
  annualMaintenance: number;
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
