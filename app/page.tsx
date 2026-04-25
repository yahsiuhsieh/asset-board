"use client";

import { useState } from "react";
import {
  Banknote,
  Bitcoin,
  Building2,
  Car,
  ChartNoAxesCombined,
  CircleDollarSign,
  Landmark,
  Link2,
  PieChart,
  TrendingUp,
  WalletCards
} from "lucide-react";

import { AssetCard } from "@/components/dashboard/AssetCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateMonthlyNetCashFlow,
  calculatePropertyEquity,
  calculatePropertyROI,
  calculateRealEstatePortfolioROI,
  calculateTotalNetWorth
} from "@/lib/calculations";
import type { Asset, AssetType, RealEstateAsset } from "@/types/wealth";

const assets: Asset[] = [
  {
    id: "stock-1",
    name: "Public Equities",
    type: "stock",
    value: 186400,
    ticker: "VTI",
    shares: 720,
    averageCost: 194,
    currentPrice: 259
  },
  {
    id: "crypto-1",
    name: "Digital Assets",
    type: "crypto",
    value: 42800,
    symbol: "BTC",
    quantity: 0.47,
    averageCost: 54500,
    currentPrice: 91000
  },
  {
    id: "property-1",
    name: "Maple Row Duplex",
    type: "real-estate",
    value: 520000,
    address: "1420 Maple Row",
    purchasePrice: 430000,
    currentMarketValue: 520000,
    remainingMortgageBalance: 302000,
    monthlyRent: 4350,
    monthlyMortgage: 2480,
    annualExpenses: 8600,
    annualTaxes: 6900,
    annualInsurance: 2100,
    annualMaintenance: 4800
  },
  {
    id: "property-2",
    name: "Cedar Lane Condo",
    type: "real-estate",
    value: 318000,
    address: "88 Cedar Lane",
    purchasePrice: 290000,
    currentMarketValue: 318000,
    remainingMortgageBalance: 184000,
    monthlyRent: 2650,
    monthlyMortgage: 1710,
    annualExpenses: 4200,
    annualTaxes: 3900,
    annualInsurance: 1200,
    annualMaintenance: 2600
  },
  {
    id: "car-1",
    name: "Daily Driver",
    type: "car",
    value: 38500,
    make: "Tesla",
    model: "Model 3",
    year: 2023,
    loanBalance: 12000
  },
  {
    id: "cash-1",
    name: "Cash Reserve",
    type: "cash",
    value: 64500,
    institution: "Chase",
    accountMask: "2048"
  }
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

function sumByType(type: AssetType): number {
  return assets
    .filter((asset) => asset.type === type)
    .reduce((total, asset) => total + asset.value, 0);
}

const realEstateAssets = assets.filter(
  (asset): asset is RealEstateAsset => asset.type === "real-estate"
);

const allocationCards = [
  {
    title: "Stocks",
    icon: ChartNoAxesCombined,
    value: sumByType("stock")
  },
  {
    title: "Crypto",
    icon: Bitcoin,
    value: sumByType("crypto")
  },
  {
    title: "Real Estate",
    icon: Building2,
    value: sumByType("real-estate")
  },
  {
    title: "Cash",
    icon: Banknote,
    value: sumByType("cash")
  },
  {
    title: "Cars",
    icon: Car,
    value: sumByType("car")
  }
];

export default function Home() {
  const [isChaseConnected, setIsChaseConnected] = useState(false);
  const totalNetWorth = calculateTotalNetWorth(assets);
  const portfolioROI = calculateRealEstatePortfolioROI(realEstateAssets);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-8 lg:px-10">
      <section className="mb-8 rounded-[2.5rem] border border-white/70 bg-white/65 p-8 shadow-soft backdrop-blur md:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
              WealthVibe dashboard
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-foreground md:text-7xl">
              Calm command center for every asset you own.
            </h1>
          </div>
          <div className="rounded-[2rem] border bg-white/70 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Total net worth
            </p>
            <p className="mt-3 text-5xl font-semibold tracking-[-0.04em]">
              {formatCurrency(totalNetWorth)}
            </p>
          </div>
        </div>
      </section>

      <Tabs defaultValue="overview" className="w-full">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="real-estate">Real Estate</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <section className="grid grid-cols-1 gap-5 md:grid-cols-6">
            <AssetCard
              className="md:col-span-3"
              icon={WalletCards}
              primaryValue={formatCurrency(totalNetWorth)}
              title="Total Net Worth"
            />
            <AssetCard
              className="md:col-span-3"
              icon={TrendingUp}
              primaryValue={formatPercent(portfolioROI)}
              title="Portfolio ROI"
            />
            <Card className="border-white/70 bg-white/70 md:col-span-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <PieChart className="h-5 w-5" />
                  Asset Allocation
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {allocationCards.map((card) => {
                  const percentage = totalNetWorth > 0 ? card.value / totalNetWorth : 0;
                  const Icon = card.icon;

                  return (
                    <div className="rounded-3xl border bg-white/60 p-4" key={card.title}>
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <span className="font-semibold">{card.title}</span>
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">
                          {formatPercent(percentage)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${Math.min(percentage * 100, 100)}%` }}
                        />
                      </div>
                      <p className="mt-3 text-sm font-semibold">{formatCurrency(card.value)}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="border-white/70 bg-white/70 md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Landmark className="h-5 w-5" />
                  Chase Sync
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-6 text-sm leading-6 text-muted-foreground">
                  Mock Plaid Link placeholder for future automatic Chase balance and
                  transaction sync.
                </p>
                <Button onClick={() => setIsChaseConnected(true)} className="w-full">
                  <Link2 className="h-4 w-4" />
                  {isChaseConnected ? "Chase Connected" : "Connect to Chase"}
                </Button>
                <p className="mt-4 text-sm font-semibold text-muted-foreground">
                  {isChaseConnected
                    ? "Mock connection active. Plaid integration pending."
                    : "No live banking data connected."}
                </p>
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="real-estate">
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {realEstateAssets.map((property) => {
              const netCashFlow = calculateMonthlyNetCashFlow(property);
              const equity = calculatePropertyEquity(property);
              const roi = calculatePropertyROI(property);

              return (
                <AssetCard
                  description={property.address}
                  icon={CircleDollarSign}
                  key={property.id}
                  mode="detail"
                  primaryValue={formatCurrency(netCashFlow)}
                  rows={[
                    { label: "Monthly rent", value: formatCurrency(property.monthlyRent) },
                    { label: "Mortgage", value: formatCurrency(property.monthlyMortgage) },
                    { label: "Taxes", value: formatCurrency(property.annualTaxes / 12) },
                    { label: "Insurance", value: formatCurrency(property.annualInsurance / 12) },
                    {
                      label: "Maintenance",
                      value: formatCurrency(property.annualMaintenance / 12)
                    },
                    {
                      label: "Net cash flow",
                      value: formatCurrency(netCashFlow),
                      emphasis: netCashFlow >= 0 ? "positive" : "negative"
                    },
                    { label: "Annual ROI", value: formatPercent(roi) },
                    { label: "Equity", value: formatCurrency(equity) }
                  ]}
                  title={property.name}
                />
              );
            })}
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}
