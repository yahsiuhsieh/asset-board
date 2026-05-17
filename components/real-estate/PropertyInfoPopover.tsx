"use client";

import { Info } from "lucide-react";

import type { RealEstateAsset } from "@/types/wealth";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  const [year, month, day] = value.split("T")[0].split("-");

  if (!year || !month || !day) {
    return "Not set";
  }

  return `${month}/${day}/${year}`;
}

function formatText(value: string | null): string {
  return value?.trim() || "Not set";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/70 py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[12rem] text-right font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function PropertyInfoPopover({ property }: { property: RealEstateAsset }) {
  return (
    <div className="group relative inline-flex">
      <button
        aria-label="Property information"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
      >
        <Info className="h-4 w-4" />
      </button>
      <div className="absolute right-0 top-full z-50 mt-2 hidden w-72 max-w-[calc(100vw-6rem)] rounded-md border border-border bg-card p-4 text-sm shadow-lg group-hover:block group-focus-within:block">
        <p className="font-semibold text-foreground">Property details</p>
        <dl className="mt-2">
          <InfoRow label="County" value={formatText(property.county)} />
          <InfoRow label="Purchase date" value={formatDate(property.purchasedAt)} />
          <InfoRow label="Parcel number" value={formatText(property.parcelNumber)} />
          <InfoRow label="Purchase price" value={formatCurrency(property.purchasePrice)} />
          <InfoRow
            label="Mortgage balance"
            value={formatCurrency(property.remainingMortgageBalance)}
          />
          <InfoRow
            label="Monthly mortgage"
            value={formatCurrency(property.monthlyMortgage)}
          />
          <InfoRow label="Cost of building" value={formatCurrency(property.buildingCost)} />
          <InfoRow label="Cost of land" value={formatCurrency(property.landCost)} />
          <InfoRow
            label="Total depreciation"
            value={formatCurrency(property.totalDepreciation)}
          />
        </dl>
      </div>
    </div>
  );
}
