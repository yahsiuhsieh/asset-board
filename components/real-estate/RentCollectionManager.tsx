import type { RealEstateAssetDetail } from "@/types/wealth";
import { getCurrentMonth, getRentalIncomeForMonth } from "@/lib/real-estate-rent";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function getTrackedCollectedAmount(
  property: RealEstateAssetDetail,
  reviewMonth: string
): number {
  return getRentalIncomeForMonth(property.propertyTransactions, reviewMonth);
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

function getCollectionStatusClassName(status: string): string {
  if (status === "Collected") {
    return "text-emerald-700";
  }

  if (status === "Partial") {
    return "text-amber-700";
  }

  if (status === "Pending") {
    return "text-red-600";
  }

  return "text-slate-900";
}

export function RentCollectionManager({
  property,
  reviewMonth = getCurrentMonth()
}: {
  property: RealEstateAssetDetail;
  reviewMonth?: string;
}) {
  const collectedAmount = getTrackedCollectedAmount(property, reviewMonth);
  const collectionStatus = getCollectionStatus(property, collectedAmount);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="rounded-md border border-slate-200 bg-secondary p-4">
        <p className="text-sm font-semibold text-muted-foreground">Collected</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {formatCurrency(collectedAmount)}
        </p>
      </div>
      <div className="rounded-md border border-slate-200 bg-secondary p-4">
        <p className="text-sm font-semibold text-muted-foreground">Target Rent</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {formatCurrency(property.monthlyRent)}
        </p>
      </div>
      <div className="rounded-md border border-slate-200 bg-secondary p-4">
        <p className="text-sm font-semibold text-muted-foreground">Status</p>
        <p
          className={`mt-2 text-2xl font-semibold tracking-tight ${getCollectionStatusClassName(
            collectionStatus
          )}`}
        >
          {collectionStatus}
        </p>
      </div>
    </div>
  );
}
