import { Banknote, Bitcoin, Building2, Car, ChartNoAxesCombined, Home, PieChart, TrendingUp, Wallet, WalletCards } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateMonthlyNetCashFlow,
  calculatePropertyEquity,
  calculateTotalNetWorth
} from "@/lib/calculations";
import type { Asset, AssetType, RealEstateAsset } from "@/types/wealth";

interface OverviewDashboardProps {
  assets: Asset[];
}

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

function sumByType(assets: Asset[], type: AssetType): number {
  return assets
    .filter((asset) => asset.type === type)
    .reduce((total, asset) => total + asset.value, 0);
}

function calculateTotalEquity(properties: RealEstateAsset[]): number {
  return properties.reduce(
    (total, property) => total + calculatePropertyEquity(property),
    0
  );
}

function calculateTotalMonthlyCashFlow(properties: RealEstateAsset[]): number {
  return properties.reduce(
    (total, property) => total + calculateMonthlyNetCashFlow(property),
    0
  );
}

function MetricTile({
  title,
  value,
  icon: Icon,
  tone = "neutral"
}: {
  title: string;
  value: string;
  icon: typeof WalletCards;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex min-h-[8.5rem] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-semibold text-muted-foreground">{title}</p>
          <div className="rounded-md border border-primary/15 bg-primary/10 p-2.5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p
          className={
            tone === "positive"
              ? "text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
              : tone === "negative"
                ? "text-3xl font-semibold tracking-tight text-red-600 dark:text-red-400"
                : "text-3xl font-semibold tracking-tight"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function OverviewDashboard({ assets }: OverviewDashboardProps) {
  const totalNetWorth = calculateTotalNetWorth(assets);
  const realEstateAssets = assets.filter(
    (asset): asset is RealEstateAsset => asset.type === "real-estate"
  );
  const realEstateValue = sumByType(assets, "real-estate");
  const totalEquity = calculateTotalEquity(realEstateAssets);
  const totalMonthlyCashFlow = calculateTotalMonthlyCashFlow(realEstateAssets);
  const allocationCards = [
    {
      title: "Stocks",
      icon: ChartNoAxesCombined,
      value: sumByType(assets, "stock")
    },
    {
      title: "Crypto",
      icon: Bitcoin,
      value: sumByType(assets, "crypto")
    },
    {
      title: "Real Estate",
      icon: Building2,
      value: realEstateValue
    },
    {
      title: "Cash",
      icon: Banknote,
      value: sumByType(assets, "cash")
    },
    {
      title: "Cars",
      icon: Car,
      value: sumByType(assets, "car")
    }
  ];

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-border bg-card p-6 shadow-soft md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Overview
        </p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Household portfolio
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              High-level view across current assets and real estate performance.
            </p>
          </div>
          <div className="rounded-md border border-border bg-secondary px-5 py-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Total net worth
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {formatCurrency(totalNetWorth)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={WalletCards}
          title="Total Net Worth"
          value={formatCurrency(totalNetWorth)}
        />
        <MetricTile
          icon={Building2}
          title="Real Estate Value"
          value={formatCurrency(realEstateValue)}
        />
        <MetricTile
          icon={Wallet}
          title="Real Estate Equity"
          value={formatCurrency(totalEquity)}
        />
        <MetricTile
          icon={TrendingUp}
          title="Monthly Cash Flow"
          tone={totalMonthlyCashFlow >= 0 ? "positive" : "negative"}
          value={formatCurrency(totalMonthlyCashFlow)}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="border-border bg-card lg:col-span-2">
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
                <div className="rounded-md border border-border bg-card p-4" key={card.title}>
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-semibold">{card.title}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {formatPercent(percentage)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.min(percentage * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm font-semibold">{formatCurrency(card.value)}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border bg-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Home className="h-5 w-5" />
              Property Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {realEstateAssets.length > 0 ? (
              realEstateAssets.map((property) => {
                const netCashFlow = calculateMonthlyNetCashFlow(property);
                const equity = calculatePropertyEquity(property);

                return (
                  <div
                    className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto]"
                    key={property.id}
                  >
                    <div>
                      <p className="font-semibold">{property.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{property.address}</p>
                    </div>
                    <div className="md:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Equity
                      </p>
                      <p className="font-semibold">{formatCurrency(equity)}</p>
                    </div>
                    <div className="md:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Cash Flow
                      </p>
                      <p
                        className={
                          netCashFlow >= 0
                            ? "font-semibold text-emerald-600 dark:text-emerald-400"
                            : "font-semibold text-red-600 dark:text-red-400"
                        }
                      >
                        {formatCurrency(netCashFlow)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-md border border-border bg-card p-5 text-sm font-semibold text-muted-foreground">
                No properties yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
