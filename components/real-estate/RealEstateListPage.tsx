import Link from "next/link";
import { ArrowRight, Building2, Landmark, Plus, TrendingUp, Wallet } from "lucide-react";

import { RealEstatePropertyForm } from "@/components/dashboard/RealEstatePropertyForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateMonthlyNetCashFlow, calculatePropertyEquity } from "@/lib/calculations";
import { getExternalMapUrl } from "@/lib/maps";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { PropertyImage } from "./PropertyImage";
import { PropertyMap } from "./PropertyMap";

interface RealEstateListPageProps {
  properties: RealEstateAssetDetail[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
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
    <Card className="border-slate-200 bg-white">
      <CardContent className="flex min-h-[8rem] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-semibold text-muted-foreground">{title}</p>
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-2.5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p
          className={
            tone === "positive"
              ? "text-3xl font-semibold tracking-tight text-emerald-600"
              : tone === "negative"
                ? "text-3xl font-semibold tracking-tight text-red-600"
                : "text-3xl font-semibold tracking-tight"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function RealEstateListPage({ properties }: RealEstateListPageProps) {
  const portfolioValue = sum(properties.map((property) => property.value));
  const equity = sum(properties.map(calculatePropertyEquity));
  const mortgageBalance = sum(
    properties.map((property) => property.remainingMortgageBalance)
  );
  const cashFlow = sum(properties.map(calculateMonthlyNetCashFlow));

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft md:p-8">
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
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            href="#add-property"
          >
            <Plus className="h-4 w-4" />
            Add Property
          </a>
        </div>
      </section>

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

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {properties.length > 0 ? (
          properties.map((property) => {
            const coverPhoto = property.photos.find((photo) => photo.isCover) ?? property.photos[0];
            const netCashFlow = calculateMonthlyNetCashFlow(property);
            const propertyEquity = calculatePropertyEquity(property);

            return (
              <Card className="overflow-hidden border-slate-200 bg-white" key={property.id}>
                <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
                  <PropertyImage
                    alt={property.name}
                    className="relative min-h-[15rem]"
                    src={coverPhoto?.signedUrl}
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
                      </div>
                      <Link
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-secondary"
                        href={`/real-estate/${property.id}`}
                      >
                        View
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Value
                        </p>
                        <p className="mt-1 font-semibold">{formatCurrency(property.value)}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Equity
                        </p>
                        <p className="mt-1 font-semibold">{formatCurrency(propertyEquity)}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Rent
                        </p>
                        <p className="mt-1 font-semibold">{formatCurrency(property.monthlyRent)}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Cash Flow
                        </p>
                        <p
                          className={
                            netCashFlow >= 0
                              ? "mt-1 font-semibold text-emerald-600"
                              : "mt-1 font-semibold text-red-600"
                          }
                        >
                          {formatCurrency(netCashFlow)}
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
          <Card className="border-slate-200 bg-white xl:col-span-2">
            <CardContent className="p-6 text-sm font-semibold text-muted-foreground">
              No properties yet.
            </CardContent>
          </Card>
        )}
      </section>

      <section id="add-property">
        <Card className="border-slate-200 bg-white">
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
