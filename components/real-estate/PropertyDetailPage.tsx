import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Home,
  Info,
  MapPin,
  TrendingUp,
  Wallet
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateAnnualNOI,
  calculateCashOnCashReturn,
  calculateCapRate,
  calculateExpenseRatio,
  calculateMonthlyNetCashFlow,
  calculateMonthlyNOI,
  calculatePropertyEquity,
  calculateTotalReturnSincePurchase,
  calculateTotalReturnSincePurchaseAmount,
  getYtdAverageMonthlyOperatingExpenses
} from "@/lib/calculations";
import { getRecordedExpensesForMonth } from "@/lib/real-estate-expenses";
import { getExternalMapUrl } from "@/lib/maps";
import type { PropertyAnnualQualityResult } from "@/lib/real-estate-annual-quality";
import type { PropertyValuationUsageStatus } from "@/lib/valuations/property-valuation-usage";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { BankConnectionDialog } from "./BankConnectionDialog";
import { CoverPhotoUploadButton } from "./CoverPhotoUploadButton";
import { EditPropertyDialog } from "./EditPropertyDialog";
import {
  MetricBenchmarkInfo,
  type MetricBenchmarkType
} from "./MetricBenchmarkBand";
import { MonthlyReviewWorkspace } from "./MonthlyReviewWorkspace";
import { PropertyAnnualReportIssues } from "./PropertyAnnualReportIssues";
import { PropertyHistoryCharts } from "./PropertyHistoryCharts";
import { PropertyImage } from "./PropertyImage";
import { PropertyInfoPopover } from "./PropertyInfoPopover";
import { PropertyLocationForm } from "./PropertyLocationForm";
import { PropertyMap } from "./PropertyMap";
import { ValuationManager } from "./ValuationManager";

interface PropertyDetailPageProps {
  annualQualityResult: PropertyAnnualQualityResult;
  annualReportYear: string;
  annualReportYears: string[];
  initialReviewMonth?: string;
  property: RealEstateAssetDetail;
  propertyOptions: Array<Pick<RealEstateAssetDetail, "address" | "id" | "name">>;
  valuationUsage: PropertyValuationUsageStatus;
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

function formatReturnMetric({
  amount,
  missingLabel,
  ratio
}: {
  amount: number | null;
  missingLabel: string;
  ratio: number | null;
}): string {
  if (amount == null || ratio == null) {
    return missingLabel;
  }

  return `${formatCurrency(amount)} (${formatPercent(ratio)})`;
}

function getSignedValueClassName(value: number | null): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (value > 0) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (value < 0) {
    return "text-red-600 dark:text-red-400";
  }

  return undefined;
}

function getRentalStatusLabel(status: RealEstateAssetDetail["rentalStatus"]): string {
  return status === "vacant" ? "Vacant" : "Rented";
}

function getRentalStatusClassName(status: RealEstateAssetDetail["rentalStatus"]): string {
  return status === "vacant"
    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300"
    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300";
}

function MetricTile({
  title,
  value,
  icon: Icon,
  tone = "neutral"
}: {
  title: string;
  value: string;
  icon: typeof Home;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-muted-foreground">{title}</p>
        <div className="rounded-md border border-primary/15 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p
        className={
          tone === "positive"
            ? "mt-4 text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
            : tone === "negative"
              ? "mt-4 text-2xl font-semibold tracking-tight text-red-600 dark:text-red-400"
              : "mt-4 text-2xl font-semibold tracking-tight"
        }
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  benchmarkMetric,
  benchmarkValue,
  description,
  label,
  value,
  valueClassName
}: {
  benchmarkMetric?: MetricBenchmarkType;
  benchmarkValue?: number | null;
  description?: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  const hasInfo = Boolean(description || benchmarkMetric);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-3 text-sm last:border-0">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {label}
        {hasInfo ? (
          <span className="group relative inline-flex">
            <button
              aria-label={`${label} info`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={typeof description === "string" ? description : `${label} info`}
              type="button"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <span className="pointer-events-none absolute right-0 top-full z-40 mt-2 hidden w-96 max-w-[calc(100vw-4rem)] rounded-md border border-border bg-card px-3 py-2 text-xs font-medium leading-relaxed text-muted-foreground shadow-lg group-hover:block group-focus-within:block">
              <span className="grid gap-3">
                {description ? <span>{description}</span> : null}
                {benchmarkMetric ? (
                  <MetricBenchmarkInfo
                    metric={benchmarkMetric}
                    value={benchmarkValue ?? null}
                  />
                ) : null}
              </span>
            </span>
          </span>
        ) : null}
      </span>
      <span className={`font-semibold ${valueClassName ?? ""}`}>{value}</span>
    </div>
  );
}

export function PropertyDetailPage({
  annualQualityResult,
  annualReportYear,
  annualReportYears,
  initialReviewMonth,
  property,
  propertyOptions,
  valuationUsage
}: PropertyDetailPageProps) {
  const coverPhoto = property.coverPhoto;
  const currentMonthExpenses = getRecordedExpensesForMonth(property.propertyTransactions);
  const ytdAverageMonthlyExpenses = getYtdAverageMonthlyOperatingExpenses(property);
  const netCashFlow = calculateMonthlyNetCashFlow(property);
  const monthlyNOI = calculateMonthlyNOI(property);
  const annualNOI = calculateAnnualNOI(property);
  const capRate = calculateCapRate(property);
  const expenseRatio = calculateExpenseRatio(property);
  const cashOnCashReturn = calculateCashOnCashReturn(property);
  const totalReturnSincePurchaseAmount =
    calculateTotalReturnSincePurchaseAmount(property);
  const totalReturnSincePurchase = calculateTotalReturnSincePurchase(property);
  const totalReturnSincePurchaseLabel =
    property.cashInvested <= 0
      ? "Needs cash invested"
      : !property.purchasedAt
        ? "Needs purchase date"
        : "N/A";
  const equity = calculatePropertyEquity(property);
  const externalMapUrl = getExternalMapUrl(property.address);

  return (
    <div className="grid gap-5" data-testid="property-detail-page">
      <section className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
          href="/real-estate"
        >
          <ArrowLeft className="h-4 w-4" />
          Real Estate
        </Link>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            AssetBoard / Real Estate / Property
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Property overview
          </h1>
        </div>
      </section>

      <Card className="border-border bg-card">
        <CardContent className="p-4 md:p-6">
          <div className="relative">
            <PropertyImage
              alt={property.name}
              className="relative min-h-[20rem] overflow-hidden rounded-md md:min-h-[28rem]"
              priority
              src={coverPhoto?.signedUrl}
            />
            <CoverPhotoUploadButton
              assetId={property.id}
              hasCoverPhoto={Boolean(coverPhoto)}
            />
            <div className="absolute bottom-4 right-4 rounded-md bg-card/95 px-4 py-3 text-right shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Current Value
              </p>
              <p className="mt-1 text-2xl font-semibold text-primary">
                {formatCurrency(property.currentMarketValue)}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">{property.name}</h2>
                <EditPropertyDialog property={property} />
                <PropertyInfoPopover property={property} />
                <BankConnectionDialog property={property} />
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
                  href={externalMapUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MapPin className="h-4 w-4" />
                  {property.address}
                </a>
                <span
                  className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${getRentalStatusClassName(
                    property.rentalStatus
                  )}`}
                >
                  {getRentalStatusLabel(property.rentalStatus)}
                </span>
              </div>
            </div>
            <ValuationManager property={property} usage={valuationUsage} />
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Home}
          title="Current Value"
          value={formatCurrency(property.currentMarketValue)}
        />
        <MetricTile icon={Wallet} title="Equity" value={formatCurrency(equity)} />
        <MetricTile
          icon={TrendingUp}
          title="Net Cash Flow"
          tone={netCashFlow >= 0 ? "positive" : "negative"}
          value={formatCurrency(netCashFlow)}
        />
        <MetricTile
          icon={ChartNoAxesCombined}
          title="Monthly Rent"
          value={formatCurrency(property.monthlyRent)}
        />
      </section>

      <section>
        <PropertyAnnualReportIssues
          annualReportYear={annualReportYear}
          annualReportYears={annualReportYears}
          qualityResult={annualQualityResult}
        />
      </section>

      <section>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <PropertyHistoryCharts
              property={property}
              snapshots={property.snapshots}
              transactions={property.propertyTransactions}
            />
          </CardContent>
        </Card>
      </section>

      <section id="monthly-review">
        <MonthlyReviewWorkspace
          initialReviewMonth={initialReviewMonth}
          property={property}
          propertyOptions={propertyOptions}
        />
      </section>

      <section>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Financial Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Performance</h3>
              <div className="mt-2">
                <DetailRow
                  description="Monthly rental income minus operating expenses, before debt service."
                  label="Monthly net operating income"
                  value={formatCurrency(monthlyNOI)}
                />
                <DetailRow
                  description="Rental income minus average monthly operating expenses, annualized."
                  label="Annual net operating income"
                  value={formatCurrency(annualNOI)}
                />
                <DetailRow
                  benchmarkMetric="capRate"
                  benchmarkValue={capRate}
                  description="Annual NOI divided by the current property value."
                  label="Cap rate"
                  value={formatPercent(capRate)}
                />
                <DetailRow
                  benchmarkMetric="expenseRatio"
                  benchmarkValue={expenseRatio}
                  description="Average monthly operating expenses as a percentage of rental income."
                  label="Expense ratio"
                  value={formatPercent(expenseRatio)}
                />
                <DetailRow
                  benchmarkMetric="cashOnCashReturn"
                  benchmarkValue={cashOnCashReturn}
                  description="Annual cash flow after debt service divided by cash invested."
                  label="Cash-on-cash return"
                  valueClassName={getSignedValueClassName(cashOnCashReturn)}
                  value={
                    property.cashInvested > 0
                      ? formatPercent(cashOnCashReturn)
                      : "Needs cash invested"
                  }
                />
                <DetailRow
                  description="Current equity plus cumulative cash flow after debt service, minus cash invested."
                  label="Total return since purchase"
                  valueClassName={getSignedValueClassName(totalReturnSincePurchaseAmount)}
                  value={formatReturnMetric({
                    amount: totalReturnSincePurchaseAmount,
                    missingLabel: totalReturnSincePurchaseLabel,
                    ratio: totalReturnSincePurchase
                  })}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Value & Debt</h3>
              <div className="mt-2">
                <DetailRow
                  description="Original amount paid for the property."
                  label="Purchase price"
                  value={formatCurrency(property.purchasePrice)}
                />
                <DetailRow
                  description="Net owner cash still invested in the property."
                  label="Cash invested"
                  value={formatCurrency(property.cashInvested)}
                />
                <DetailRow
                  description="Latest stored market value for this property."
                  label="Current value"
                  value={formatCurrency(property.currentMarketValue)}
                />
                <DetailRow
                  description="Remaining unpaid loan balance on the property."
                  label="Mortgage balance"
                  value={formatCurrency(property.remainingMortgageBalance)}
                />
                <DetailRow
                  description="Current value minus the remaining mortgage balance."
                  label="Equity"
                  value={formatCurrency(equity)}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Monthly Financials</h3>
              <div className="mt-2">
                <DetailRow
                  description="Target monthly rent amount for this property."
                  label="Monthly rent"
                  value={formatCurrency(property.monthlyRent)}
                />
                <DetailRow
                  description="Expected monthly mortgage payment for this property."
                  label="Monthly mortgage"
                  value={formatCurrency(property.monthlyMortgage)}
                />
                <DetailRow
                  description="Full actual expense transactions posted in the current month."
                  label="Current month expenses"
                  value={formatCurrency(currentMonthExpenses)}
                />
                <DetailRow
                  description="All actual expenses from January through this month divided by elapsed months this year."
                  label="YTD average monthly expenses"
                  value={formatCurrency(ytdAverageMonthlyExpenses)}
                />
                <DetailRow
                  description="Rent minus mortgage and operating expenses for the month."
                  label="Net cash flow"
                  value={formatCurrency(netCashFlow)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Property Location</CardTitle>
          </CardHeader>
          <CardContent>
            <PropertyMap property={property} />
            <p className="mt-3 text-sm text-muted-foreground">{property.address}</p>
            <PropertyLocationForm property={property} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
