import type { RealEstateDataCoverageStatus } from "@/lib/real-estate-data-coverage";
import { cn } from "@/lib/utils";

const statusClasses: Record<RealEstateDataCoverageStatus, string> = {
  closed_accepted:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300",
  complete:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300",
  in_progress:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-800/70 dark:bg-cyan-950/35 dark:text-cyan-300",
  needs_reconnect:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-300",
  needs_sync:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300",
  no_bank_coverage:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/35 dark:text-sky-300"
};

export function getDataCoverageStatusLabel(
  status: RealEstateDataCoverageStatus
): string {
  if (status === "closed_accepted") {
    return "";
  }

  if (status === "complete") {
    return "Bank data complete";
  }

  if (status === "in_progress") {
    return "Month in progress";
  }

  if (status === "needs_reconnect") {
    return "Needs reconnect";
  }

  if (status === "needs_sync") {
    return "Missing bank sync";
  }

  return "No bank coverage";
}

export function DataCoverageBadge({
  className,
  status
}: {
  className?: string;
  status: RealEstateDataCoverageStatus;
}) {
  if (status === "closed_accepted") {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold",
        statusClasses[status],
        className
      )}
    >
      {getDataCoverageStatusLabel(status)}
    </span>
  );
}
