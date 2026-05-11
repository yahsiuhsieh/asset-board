"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import {
  syncPropertyValuation,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PropertyValuationUsageStatus } from "@/lib/valuations/property-valuation-usage";
import type { RealEstateAssetDetail } from "@/types/wealth";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function SyncButton({
  disabled,
  disabledReason
}: {
  disabled: boolean;
  disabledReason: string | null;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <span
      className="w-full sm:w-fit lg:ml-auto"
      title={disabled && disabledReason ? disabledReason : undefined}
    >
      <Button className="w-full" disabled={isDisabled} size="sm" type="submit">
        <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : "")} />
        {pending ? "Syncing" : "Sync Valuation"}
      </Button>
    </span>
  );
}

export function ValuationManager({
  property,
  usage
}: {
  property: RealEstateAssetDetail;
  usage: PropertyValuationUsageStatus;
}) {
  const [state, syncAction] = useActionState(
    syncPropertyValuation.bind(null, property.id),
    initialState
  );
  const syncDisabled =
    usage.isLiveProvider && (!usage.isTrackingAvailable || usage.isLimitReached);
  const disabledReason =
    syncDisabled && usage.message ? usage.message : "Monthly live valuation limit reached.";

  return (
    <form action={syncAction} className="grid w-full gap-2 text-left sm:w-fit lg:justify-items-end lg:text-right">
      <SyncButton disabled={syncDisabled} disabledReason={disabledReason} />
      <p className="text-xs font-semibold text-muted-foreground">
        Last synced: {formatDate(property.currentMarketValueSyncedAt)}
      </p>
      {usage.isLiveProvider && usage.isTrackingAvailable ? (
        <p className="text-xs font-semibold text-muted-foreground">
          Live syncs this month: {usage.used}/{usage.limit}
        </p>
      ) : null}
      {syncDisabled && usage.message ? (
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{usage.message}</p>
      ) : null}
      {state.message ? (
        <p
          className={cn(
            "text-xs font-semibold",
            state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
