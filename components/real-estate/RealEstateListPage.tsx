import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Building2,
  CheckCircle2,
  Landmark,
  Plus,
  ReceiptText,
  TrendingUp,
  Wallet
} from "lucide-react";

import { RealEstatePropertyForm } from "@/components/dashboard/RealEstatePropertyForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateAnnualNOI,
  calculateCapRate,
  calculateMonthlyNetCashFlow,
  calculateMonthlyNOI,
  calculatePropertyEquity
} from "@/lib/calculations";
import { getExternalMapUrl } from "@/lib/maps";
import type { PropertyAnnualQualityResult } from "@/lib/real-estate-annual-quality";
import { getPortfolioAnnualStatement } from "@/lib/real-estate-annual-statement";
import { getMonthlyDataCoverageAssessment } from "@/lib/real-estate-data-coverage";
import { getPropertyReviewMonths } from "@/lib/real-estate-monthly-review";
import { getRentalIncomeForMonth } from "@/lib/real-estate-rent";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { DataCoverageBadge } from "./DataCoverageBadge";
import { PortfolioAnnualReportActions } from "./PortfolioAnnualReportActions";
import { PropertyImage } from "./PropertyImage";
import { PropertyMap } from "./PropertyMap";
import { RealEstatePortfolioNav } from "./RealEstatePortfolioNav";

interface RealEstateListPageProps {
  properties: RealEstateAssetDetail[];
  annualReportYear: string;
  annualReportYears: string[];
  annualQualityResults: PropertyAnnualQualityResult[];
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

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return percentFormatter.format(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function getCurrentMonthRentCollected(property: RealEstateAssetDetail): number {
  return getRentalIncomeForMonth(property.propertyTransactions);
}

function getRentalStatusLabel(status: RealEstateAssetDetail["rentalStatus"]): string {
  return status === "vacant" ? "Vacant" : "Rented";
}

function getRentalStatusClassName(status: RealEstateAssetDetail["rentalStatus"]): string {
  return status === "vacant"
    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300"
    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300";
}

function getCurrentReviewMonth(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPropertyCardCoverageStatus(
  property: RealEstateAssetDetail,
  annualReportYear: string
) {
  const reviewMonths = getPropertyReviewMonths(property, annualReportYear);
  const reviewMonth = reviewMonths[reviewMonths.length - 1] ?? getCurrentReviewMonth();

  return getMonthlyDataCoverageAssessment(property, reviewMonth).status;
}

function MetricTile({
  title,
  value,
  icon: Icon,
  tone = "neutral"
}: {
  title: string;
  value: string;
  icon: typeof Building2;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex min-h-[8rem] flex-col justify-between p-5">
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

export function RealEstateListPage({
  annualQualityResults,
  annualReportYear,
  annualReportYears,
  properties
}: RealEstateListPageProps) {
  const portfolioValue = sum(properties.map((property) => property.value));
  const equity = sum(properties.map(calculatePropertyEquity));
  const mortgageBalance = sum(
    properties.map((property) => property.remainingMortgageBalance)
  );
  const cashFlow = sum(properties.map(calculateMonthlyNetCashFlow));
  const monthlyRent = sum(properties.map((property) => property.monthlyRent));
  const monthlyNOI = sum(properties.map(calculateMonthlyNOI));
  const annualNOI = sum(properties.map(calculateAnnualNOI));
  const portfolioCapRate = portfolioValue > 0 ? annualNOI / portfolioValue : 0;
  const rentCollected = sum(properties.map(getCurrentMonthRentCollected));
  const collectionRate = monthlyRent > 0 ? rentCollected / monthlyRent : 0;
  const pendingRentCount = properties.filter(
    (property) =>
      property.monthlyRent > 0 && getCurrentMonthRentCollected(property) < property.monthlyRent
  ).length;
  const annualStatement = getPortfolioAnnualStatement(properties, annualReportYear);
  const annualRowsByPropertyId = new Map(
    annualStatement.propertyRows.map((row) => [row.propertyId, row])
  );

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-border bg-card p-6 shadow-soft md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Real Estate
        </p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Property portfolio
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track property values, rent, cash flow, locations, and history.
            </p>
          </div>
          <PortfolioAnnualReportActions
            annualQualityResults={annualQualityResults}
            annualReportYear={annualReportYear}
            annualReportYears={annualReportYears}
          />
        </div>
      </section>

      <RealEstatePortfolioNav active="portfolio" />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Building2}
          title="Portfolio Value"
          value={formatCurrency(portfolioValue)}
        />
        <MetricTile icon={Wallet} title="Equity" value={formatCurrency(equity)} />
        <MetricTile
          icon={Landmark}
          title="Mortgage Balance"
          value={formatCurrency(mortgageBalance)}
        />
        <MetricTile
          icon={TrendingUp}
          title="Monthly Cash Flow"
          tone={cashFlow >= 0 ? "positive" : "negative"}
          value={formatCurrency(cashFlow)}
        />
      </section>

      <section>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <ReceiptText className="h-5 w-5 text-primary" />
              Portfolio Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Monthly Rent
                </p>
                <Banknote className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {formatCurrency(monthlyRent)}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Monthly Net Operating Income
                </p>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p
                className={
                  monthlyNOI >= 0
                    ? "mt-3 text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
                    : "mt-3 text-2xl font-semibold tracking-tight text-red-600 dark:text-red-400"
                }
              >
                {formatCurrency(monthlyNOI)}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Portfolio Cap Rate
                </p>
                <BadgePercent className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {formatPercent(portfolioCapRate)}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Rent Collected This Month
                </p>
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {formatCurrency(rentCollected)}
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {formatPercent(collectionRate)} collected · {pendingRentCount} pending
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5">
        {properties.length > 0 ? (
          properties.map((property) => {
            const capRate = calculateCapRate(property);
            const coverageStatus = getPropertyCardCoverageStatus(
              property,
              annualReportYear
            );
            const statementRow = annualRowsByPropertyId.get(property.id);
            const ytdCashFlow = statementRow?.cashFlowAfterDebtService ?? 0;

            return (
              <Card
                className="overflow-hidden border-border bg-card"
                data-testid={`property-card-${property.id}`}
                key={property.id}
              >
                <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
                  <PropertyImage
                    alt={property.name}
                    className="relative min-h-[15rem]"
                    src={property.coverPhoto?.signedUrl}
                  />
                  <div className="grid gap-4 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight">
                          {property.name}
                        </h2>
                        <a
                          className="mt-1 block text-sm text-muted-foreground hover:text-primary"
                          href={getExternalMapUrl(property.address)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {property.address}
                        </a>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${getRentalStatusClassName(
                              property.rentalStatus
                            )}`}
                          >
                            {getRentalStatusLabel(property.rentalStatus)}
                          </span>
                          <DataCoverageBadge status={coverageStatus} />
                        </div>
                      </div>
                      <Link
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary"
                        data-testid={`property-detail-link-${property.id}`}
                        href={`/real-estate/${property.id}`}
                      >
                        View
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Current Value
                        </p>
                        <p className="mt-1 font-semibold">{formatCurrency(property.currentMarketValue)}</p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          YTD Rent Collected
                        </p>
                        <p className="mt-1 font-semibold">{formatCurrency(statementRow?.rentCollected ?? 0)}</p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          YTD Operating Expenses
                        </p>
                        <p className="mt-1 font-semibold">{formatCurrency(statementRow?.totalOperatingExpenses ?? 0)}</p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          YTD Cash Flow
                        </p>
                        <p
                          className={
                            ytdCashFlow >= 0
                              ? "mt-1 font-semibold text-emerald-600 dark:text-emerald-400"
                              : "mt-1 font-semibold text-red-600 dark:text-red-400"
                          }
                        >
                          {formatCurrency(ytdCashFlow)}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Expense Ratio
                        </p>
                        <p className="mt-1 font-semibold">
                          {formatPercent(statementRow?.expenseRatio ?? null)}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Cap Rate
                        </p>
                        <p className="mt-1 font-semibold">
                          {formatPercent(capRate)}
                        </p>
                      </div>
                    </div>

                    <PropertyMap property={property} />
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-sm font-semibold text-muted-foreground">
              No properties yet.
            </CardContent>
          </Card>
        )}
      </section>

      <section id="add-property">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-primary" />
              Add Property
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RealEstatePropertyForm mode="create" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
