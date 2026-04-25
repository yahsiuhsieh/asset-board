"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import {
  mockSyncZillowValuation,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAssetDetail } from "@/types/wealth";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function SyncButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : "")} />
      {pending ? "Syncing" : "Sync Zillow"}
    </Button>
  );
}

export function ValuationManager({ property }: { property: RealEstateAssetDetail }) {
  const [state, syncAction] = useActionState(
    mockSyncZillowValuation.bind(null, property.id),
    initialState
  );

  return (
    <form
      action={syncAction}
      className="flex flex-col gap-4 rounded-md border border-slate-200 bg-secondary p-4 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Zillow Value
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {formatCurrency(property.currentMarketValue)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Last synced: {formatDate(property.currentMarketValueSyncedAt)}
        </p>
      </div>
      <div className="flex flex-col gap-3 md:items-end">
        <SyncButton />
        {state.message ? (
          <p
            className={cn(
              "text-sm font-semibold",
              state.status === "error" ? "text-red-600" : "text-emerald-600"
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
