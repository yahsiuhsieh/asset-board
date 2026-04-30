import type { RealEstateAssetDetail } from "@/types/wealth";
import { getCurrentMonth, getRentalIncomeForMonth } from "@/lib/real-estate-rent";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0
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

function getTrackedCollectedAmount(property: RealEstateAssetDetail): number {
  return getRentalIncomeForMonth(property.propertyTransactions, getCurrentMonth());
}

function getCollectionStatus(property: RealEstateAssetDetail, collectedAmount: number): string {
  if (property.monthlyRent <= 0) {
    return "No rent target";
  }

  if (collectedAmount >= property.monthlyRent) {
    return "Collected";
  }

  if (collectedAmount > 0) {
    return "Partial";
  }

  return "Pending";
}

export function RentCollectionManager({ property }: { property: RealEstateAssetDetail }) {
  const collectedAmount = getTrackedCollectedAmount(property);
  const collectionRate = property.monthlyRent > 0 ? collectedAmount / property.monthlyRent : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Collected</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {formatCurrency(collectedAmount)}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Target Rent</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {formatCurrency(property.monthlyRent)}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Status</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {getCollectionStatus(property, collectedAmount)}
        </p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {formatPercent(collectionRate)}
        </p>
      </div>
    </div>
  );
}
