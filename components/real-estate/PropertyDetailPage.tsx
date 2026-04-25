import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ChartNoAxesCombined,
  Home,
  MapPin,
  Pencil,
  Star,
  Trash2,
  TrendingUp,
  Wallet
} from "lucide-react";

import {
  deleteMetricSnapshot,
  deletePropertyPhoto,
  setCoverPhoto
} from "@/app/actions/real-estate";
import { RealEstatePropertyForm } from "@/components/dashboard/RealEstatePropertyForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateMonthlyNetCashFlow,
  calculatePropertyEquity
} from "@/lib/calculations";
import {
  getAnnualScheduledExpenses,
  getMonthlyAverageExpenses
} from "@/lib/real-estate-expenses";
import { getExternalMapUrl } from "@/lib/maps";
import { snapshotMetricLabels } from "@/lib/real-estate-history";
import type { RealEstateAssetDetail, RealEstateDataSource } from "@/types/wealth";
import { ExpenseScheduleManager } from "./ExpenseScheduleManager";
import { PhotoUploadForm } from "./PhotoUploadForm";
import { PropertyHistoryCharts } from "./PropertyHistoryCharts";
import { PropertyImage } from "./PropertyImage";
import { PropertyLocationForm } from "./PropertyLocationForm";
import { PropertyMap } from "./PropertyMap";
import { SnapshotForm } from "./SnapshotForm";

interface PropertyDetailPageProps {
  property: RealEstateAssetDetail;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatSource(source: RealEstateDataSource): string {
  if (source === "zillow") {
    return "Zillow";
  }

  if (source === "chase") {
    return "Chase";
  }

  return "Manual";
}

function SourceBadge({ source }: { source: RealEstateDataSource }) {
  return (
    <span className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-primary">
      {formatSource(source)}
    </span>
  );
}

function MetricTile({
  title,
  value,
  icon: Icon,
  source,
  tone = "neutral"
}: {
  title: string;
  value: string;
  icon: typeof Home;
  source?: RealEstateDataSource;
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
      {source ? (
        <div className="mt-3">
          <SourceBadge source={source} />
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  source
}: {
  label: string;
  value: string;
  source?: RealEstateDataSource;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-semibold">
        {value}
        {source ? <SourceBadge source={source} /> : null}
      </span>
    </div>
  );
}

export function PropertyDetailPage({ property }: PropertyDetailPageProps) {
  const coverPhoto = property.photos.find((photo) => photo.isCover) ?? property.photos[0];
  const monthlyAverageExpenses = getMonthlyAverageExpenses(property.expenseItems);
  const annualScheduledExpenses = getAnnualScheduledExpenses(property.expenseItems);
  const netCashFlow = calculateMonthlyNetCashFlow(property);
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

      <Card className="overflow-hidden border-slate-200 bg-white">
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
              <h2 className="text-2xl font-semibold tracking-tight">{property.name}</h2>
              <a
                className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
                href={externalMapUrl}
                rel="noreferrer"
                target="_blank"
              >
                <MapPin className="h-4 w-4" />
                {property.address}
              </a>
            </div>
            <div className="flex flex-wrap gap-2">
              <SourceBadge source={property.currentMarketValueSource} />
              <SourceBadge source={property.monthlyRentSource} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Home}
          source={property.currentMarketValueSource}
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
          source={property.monthlyRentSource}
          title="Monthly Rent"
          value={formatCurrency(property.monthlyRent)}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Purchase price" value={formatCurrency(property.purchasePrice)} />
            <DetailRow
              label="Current value"
              source={property.currentMarketValueSource}
              value={formatCurrency(property.currentMarketValue)}
            />
            <DetailRow
              label="Mortgage balance"
              value={formatCurrency(property.remainingMortgageBalance)}
            />
            <DetailRow label="Equity" value={formatCurrency(equity)} />
            <DetailRow
              label="Monthly rent"
              source={property.monthlyRentSource}
              value={formatCurrency(property.monthlyRent)}
            />
            <DetailRow
              label="Monthly mortgage"
              value={formatCurrency(property.monthlyMortgage)}
            />
          </CardContent>
        </Card>

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

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Monthly Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow
              label="Monthly mortgage"
              value={formatCurrency(property.monthlyMortgage)}
            />
            <DetailRow
              label="Scheduled expenses average"
              value={formatCurrency(monthlyAverageExpenses)}
            />
            <DetailRow
              label="Annual scheduled expenses"
              value={formatCurrency(annualScheduledExpenses)}
            />
            <DetailRow
              label="Net cash flow"
              value={formatCurrency(netCashFlow)}
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Expense Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseScheduleManager assetId={property.id} expenses={property.expenseItems} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Timeline Charts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <SnapshotForm assetId={property.id} />
            <PropertyHistoryCharts snapshots={property.snapshots} />
            <div className="overflow-hidden rounded-md border border-slate-200">
              {property.snapshots.length > 0 ? (
                property.snapshots.map((snapshot) => (
                  <div
                    className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-0 md:grid-cols-[1fr_auto_auto_auto]"
                    key={snapshot.id}
                  >
                    <div>
                      <p className="font-semibold">
                        {snapshotMetricLabels[snapshot.metricType]}
                      </p>
                      {snapshot.note ? (
                        <p className="mt-1 text-muted-foreground">{snapshot.note}</p>
                      ) : null}
                    </div>
                    <p className="font-semibold">{formatCurrency(snapshot.value)}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-muted-foreground">{snapshot.recordedAt}</p>
                      <SourceBadge source={snapshot.source} />
                    </div>
                    <form action={deleteMetricSnapshot}>
                      <input name="assetId" type="hidden" value={property.id} />
                      <input name="snapshotId" type="hidden" value={snapshot.id} />
                      <button
                        className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"
                        type="submit"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </form>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm font-semibold text-muted-foreground">
                  No snapshots yet.
                </div>
              )}
            </div>
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

      <section>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Pencil className="h-5 w-5" />
              Edit Property
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RealEstatePropertyForm mode="edit" property={property} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
