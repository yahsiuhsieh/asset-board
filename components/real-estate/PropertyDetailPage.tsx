import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ChartNoAxesCombined,
  Home,
  Info,
  MapPin,
  Star,
  Trash2,
  TrendingUp,
  Wallet
} from "lucide-react";

import {
  deletePropertyPhoto,
  setCoverPhoto
} from "@/app/actions/real-estate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateAnnualNOI,
  calculateCapRate,
  calculateExpenseRatio,
  calculateMonthlyNetCashFlow,
  calculateMonthlyNOI,
  getYtdAverageMonthlyOperatingExpenses,
  calculatePropertyEquity
} from "@/lib/calculations";
import { getRecordedExpensesForMonth } from "@/lib/real-estate-expenses";
import { getExternalMapUrl } from "@/lib/maps";
import type { PropertyAnnualQualityResult } from "@/lib/real-estate-annual-quality";
import type { PropertyValuationUsageStatus } from "@/lib/valuations/property-valuation-usage";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { BankConnectionDialog } from "./BankConnectionDialog";
import { EditPropertyDialog } from "./EditPropertyDialog";
import { MonthlyReviewWorkspace } from "./MonthlyReviewWorkspace";
import { PhotoUploadForm } from "./PhotoUploadForm";
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
  property: RealEstateAssetDetail;
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

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return percentFormatter.format(value);
}

function getRentalStatusLabel(status: RealEstateAssetDetail["rentalStatus"]): string {
  return status === "vacant" ? "Vacant" : "Rented";
}

function getRentalStatusClassName(status: RealEstateAssetDetail["rentalStatus"]): string {
  return status === "vacant"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
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
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-muted-foreground">{title}</p>
        <div className="rounded-md border border-indigo-100 bg-indigo-50 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p
        className={
          tone === "positive"
            ? "mt-4 text-2xl font-semibold tracking-tight text-emerald-600"
            : tone === "negative"
              ? "mt-4 text-2xl font-semibold tracking-tight text-red-600"
              : "mt-4 text-2xl font-semibold tracking-tight"
        }
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  description,
  label,
  value
}: {
  description?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {label}
        {description ? (
          <span className="group relative inline-flex">
            <button
              aria-label={`${label} info`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={description}
              type="button"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <span className="pointer-events-none invisible absolute left-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-600 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              {description}
            </span>
          </span>
        ) : null}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function PropertyDetailPage({
  annualQualityResult,
  annualReportYear,
  annualReportYears,
  property,
  valuationUsage
}: PropertyDetailPageProps) {
  const coverPhoto = property.photos.find((photo) => photo.isCover) ?? property.photos[0];
  const currentMonthExpenses = getRecordedExpensesForMonth(property.propertyTransactions);
  const ytdAverageMonthlyExpenses = getYtdAverageMonthlyOperatingExpenses(property);
  const netCashFlow = calculateMonthlyNetCashFlow(property);
  const monthlyNOI = calculateMonthlyNOI(property);
  const annualNOI = calculateAnnualNOI(property);
  const capRate = calculateCapRate(property);
  const expenseRatio = calculateExpenseRatio(property);
  const equity = calculatePropertyEquity(property);
  const externalMapUrl = getExternalMapUrl(property.address);

  return (
    <div className="grid gap-5">
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
            WealthVibe / Real Estate / Property
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Property overview
          </h1>
        </div>
      </section>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-4 md:p-6">
          <div className="relative">
            <PropertyImage
              alt={property.name}
              className="relative min-h-[20rem] overflow-hidden rounded-md md:min-h-[28rem]"
              priority
              src={coverPhoto?.signedUrl}
            />
            <div className="absolute bottom-4 right-4 rounded-md bg-white/95 px-4 py-3 text-right shadow-soft">
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
        <Card className="border-slate-200 bg-white">
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

      <section>
        <MonthlyReviewWorkspace property={property} />
      </section>

      <section>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Financial Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Performance</h3>
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
                  description="Annual NOI divided by the current property value."
                  label="Cap rate"
                  value={formatPercent(capRate)}
                />
                <DetailRow
                  description="Average monthly operating expenses as a percentage of rental income."
                  label="Expense ratio"
                  value={formatPercent(expenseRatio)}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Value & Debt</h3>
              <div className="mt-2">
                <DetailRow
                  description="Original amount paid for the property."
                  label="Purchase price"
                  value={formatCurrency(property.purchasePrice)}
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
                  description="Expected monthly mortgage payment for this property."
                  label="Monthly mortgage"
                  value={formatCurrency(property.monthlyMortgage)}
                />
                <DetailRow
                  description="Current value minus the remaining mortgage balance."
                  label="Equity"
                  value={formatCurrency(equity)}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Monthly Financials</h3>
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
        <Card className="border-slate-200 bg-white">
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

      <section>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Camera className="h-5 w-5" />
              Photos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <PhotoUploadForm assetId={property.id} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {property.photos.length > 0 ? (
                property.photos.map((photo) => (
                  <div className="rounded-md border border-slate-200 p-3" key={photo.id}>
                    <PropertyImage
                      alt={photo.caption ?? property.name}
                      className="relative min-h-[12rem]"
                      src={photo.signedUrl}
                    />
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {photo.caption || "Property photo"}
                        </p>
                        {photo.isCover ? (
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                            Cover
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        {!photo.isCover ? (
                          <form action={setCoverPhoto}>
                            <input name="assetId" type="hidden" value={property.id} />
                            <input name="photoId" type="hidden" value={photo.id} />
                            <button
                              className="rounded-md border border-slate-200 p-2 text-muted-foreground hover:text-primary"
                              title="Set cover"
                              type="submit"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          </form>
                        ) : null}
                        <form action={deletePropertyPhoto}>
                          <input name="assetId" type="hidden" value={property.id} />
                          <input name="photoId" type="hidden" value={photo.id} />
                          <input name="storagePath" type="hidden" value={photo.storagePath} />
                          <button
                            className="rounded-md border border-slate-200 p-2 text-red-600"
                            title="Delete photo"
                            type="submit"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-slate-200 bg-secondary p-5 text-sm font-semibold text-muted-foreground md:col-span-2 xl:col-span-3">
                  No photos uploaded yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
