"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Lock, RotateCcw } from "lucide-react";

import {
  closeMonthlyReview,
  reopenMonthlyReview,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDataCoverageRangeDisplay,
  getMonthlyDataCoverageAssessment,
  isMonthlyDataCoverageCloseBlocked,
  type RealEstateDataCoverageAccountAssessment,
  type RealEstateDataCoverageDateRange,
  type RealEstateDataCoverageStatus,
  type RealEstateMonthlyDataCoverageAssessment
} from "@/lib/real-estate-data-coverage";
import { getCurrentMonth } from "@/lib/real-estate-expenses";
import {
  getMonthlyReviewAssessment,
  type MonthlyReviewAssessment,
  type MonthlyReviewSubstatus
} from "@/lib/real-estate-monthly-review";
import { cn } from "@/lib/utils";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { ExpenseTransactionManager } from "./ExpenseTransactionManager";
import { RentCollectionManager } from "./RentCollectionManager";
import { RentTransactionMatchPreview } from "./RentTransactionMatchPreview";

const initialActionState: RealEstateActionState = {
  status: "idle",
  message: ""
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatLastSynced(value: string | null): string {
  if (!value) {
    return "Not synced yet";
  }

  return timestampFormatter.format(new Date(value));
}

function formatMonthDay(value: string): string {
  return monthDayFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function formatMonthDayRange(range: RealEstateDataCoverageDateRange): string {
  return `${formatMonthDay(range.startDate)}-${formatMonthDay(range.endDate)}`;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getIsoDateDays(value: string): number {
  return Math.floor(
    new Date(`${value}T00:00:00.000Z`).getTime() / (24 * 60 * 60 * 1000)
  );
}

function getInclusiveDateSpan(startDate: string, endDate: string): number {
  return Math.max(getIsoDateDays(endDate) - getIsoDateDays(startDate) + 1, 1);
}

function minDateString(first: string, second: string): string {
  return first < second ? first : second;
}

function clampDateString(value: string, startDate: string, endDate: string): string {
  if (value < startDate) {
    return startDate;
  }

  if (value > endDate) {
    return endDate;
  }

  return value;
}

function getCoveredDayCount({
  account,
  endDate,
  startDate
}: {
  account: Pick<
    RealEstateDataCoverageAccountAssessment,
    "syncedEndDate" | "syncedStartDate"
  >;
  endDate: string;
  startDate: string;
}): number {
  if (!account.syncedStartDate || !account.syncedEndDate) {
    return 0;
  }

  if (
    account.syncedEndDate < account.syncedStartDate ||
    account.syncedEndDate < startDate ||
    account.syncedStartDate > endDate
  ) {
    return 0;
  }

  return getInclusiveDateSpan(
    clampDateString(account.syncedStartDate, startDate, endDate),
    clampDateString(account.syncedEndDate, startDate, endDate)
  );
}

function CloseMonthButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit">
      <Lock className="h-4 w-4" />
      {pending ? "Closing" : "Close Month"}
    </Button>
  );
}

function ReopenMonthButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="secondary">
      <RotateCcw className="h-4 w-4" />
      {pending ? "Reopening" : "Reopen Month"}
    </Button>
  );
}

function getOverallStatusLabel(
  assessment: MonthlyReviewAssessment,
  isDataCoverageBlocked: boolean
): string {
  if (assessment.status === "closed") {
    return "Closed";
  }

  if (assessment.status === "ready_to_close" && !isDataCoverageBlocked) {
    return "Ready to close";
  }

  return "Open";
}

function getOverallStatusClassName(
  assessment: MonthlyReviewAssessment,
  isDataCoverageBlocked: boolean
): string {
  if (assessment.status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300";
  }

  if (assessment.status === "ready_to_close" && !isDataCoverageBlocked) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-800/70 dark:bg-cyan-950/35 dark:text-cyan-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300";
}

function SubstatusBadge({
  label,
  status
}: {
  label: string;
  status: MonthlyReviewSubstatus;
}) {
  const isReady = status === "ready";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
        isReady
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300"
      )}
    >
      {isReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      {label}: {isReady ? "Ready" : "Needs review"}
    </span>
  );
}

function getBankCoverageSubstatus(
  status: RealEstateDataCoverageStatus
): "needs_review" | "no_bank" | "ready" | null {
  if (status === "closed_accepted" || status === "in_progress") {
    return null;
  }

  if (status === "complete") {
    return "ready";
  }

  if (status === "needs_sync" || status === "needs_reconnect") {
    return "needs_review";
  }

  if (status === "no_bank_coverage") {
    return "no_bank";
  }

  return null;
}

function BankCoverageBadge({
  assessment
}: {
  assessment: RealEstateMonthlyDataCoverageAssessment;
}) {
  const substatus = getBankCoverageSubstatus(assessment.status);

  if (!substatus) {
    return null;
  }

  const label =
    substatus === "ready"
      ? "Ready"
      : substatus === "needs_review"
        ? "Needs review"
        : "No bank";
  const isReady = substatus === "ready";
  const className =
    substatus === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300"
      : substatus === "needs_review"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300"
        : "border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-800/70 dark:bg-cyan-950/35 dark:text-cyan-300";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {isReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      Bank Coverage: {label}
    </span>
  );
}

function CloseMetric({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/70 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function getMissingCoverageLabel(
  account: RealEstateDataCoverageAccountAssessment,
  assessment: RealEstateMonthlyDataCoverageAssessment
): string {
  const range = getDataCoverageRangeDisplay({
    account,
    endDate: assessment.endDate,
    startDate: assessment.startDate
  });

  return range.missingRanges.length > 0
    ? `Missing ${range.missingRanges.map(formatMonthDayRange).join(", ")}`
    : "Full month covered";
}

function CoverageBar({
  account,
  assessment,
  label,
  showLabel = true,
  today,
  tone
}: {
  account: RealEstateDataCoverageAccountAssessment;
  assessment: RealEstateMonthlyDataCoverageAssessment;
  label: string;
  showLabel?: boolean;
  today?: Date;
  tone: "complete" | "missing" | "open";
}) {
  const displayAccount =
    tone === "open" && account.syncedEndDate
      ? {
          ...account,
          syncedEndDate: minDateString(
            account.syncedEndDate,
            minDateString(formatIsoDate(today ?? new Date()), assessment.endDate)
          )
        }
      : account;
  const range = getDataCoverageRangeDisplay({
    account: displayAccount,
    endDate: assessment.endDate,
    startDate: assessment.startDate
  });
  const totalDays = getInclusiveDateSpan(assessment.startDate, assessment.endDate);
  const coveredDays = getCoveredDayCount({
    account: displayAccount,
    endDate: assessment.endDate,
    startDate: assessment.startDate
  });
  const isComplete = tone === "complete";
  const isOpen = tone === "open";

  return (
    <div className="grid gap-1.5">
      <div className="flex justify-end text-xs font-semibold text-muted-foreground">
        {coveredDays}/{totalDays} days
      </div>
      <div
        aria-label={label}
        className={cn(
          "relative h-2 overflow-hidden rounded-full",
          isComplete
            ? "bg-emerald-500/85 dark:bg-emerald-400/80"
            : isOpen
              ? "bg-muted dark:bg-muted/60"
              : "bg-amber-100 dark:bg-amber-950/45"
        )}
      >
        {!isComplete && range.hasSyncedCoverage ? (
          <span
            className="absolute inset-y-0 rounded-full bg-emerald-500 dark:bg-emerald-400"
            style={{
              left: `${range.syncedStartPercent}%`,
              width: `${range.syncedWidthPercent}%`
            }}
          />
        ) : null}
      </div>
      {showLabel ? (
        <p
          className={cn(
            "text-xs font-semibold",
            isComplete
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-700 dark:text-amber-300"
          )}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

function BankCoverageRangeSummary({
  account,
  assessment,
  today,
  tone
}: {
  account: RealEstateDataCoverageAccountAssessment;
  assessment: RealEstateMonthlyDataCoverageAssessment;
  today?: Date;
  tone: "complete" | "missing" | "open";
}) {
  const label =
    tone === "complete"
      ? "Full month covered"
      : tone === "open"
        ? "Bank coverage is accumulating for this open month"
        : getMissingCoverageLabel(account, assessment);

  return (
    <CoverageBar
      account={account}
      assessment={assessment}
      label={label}
      showLabel={tone !== "open"}
      today={today}
      tone={tone}
    />
  );
}

function getBankCoverageMetricValue(
  assessment: RealEstateMonthlyDataCoverageAssessment,
  today?: Date
): ReactNode {
  if (assessment.status === "needs_reconnect") {
    return "Needs reconnect";
  }

  if (assessment.status === "no_bank_coverage") {
    return "No bank coverage";
  }

  if (assessment.status === "complete" || assessment.status === "in_progress") {
    const account = assessment.accounts[0];

    return account ? (
      <BankCoverageRangeSummary
        account={account}
        assessment={assessment}
        today={today}
        tone={assessment.status === "complete" ? "complete" : "open"}
      />
    ) : (
      ""
    );
  }

  if (assessment.status === "needs_sync") {
    const missingAccount = assessment.accounts.find(
      (account) => account.status === "needs_sync"
    );

    return missingAccount ? (
      <BankCoverageRangeSummary
        account={missingAccount}
        assessment={assessment}
        tone="missing"
      />
    ) : (
      "Missing bank sync"
    );
  }

  return "";
}

function BankCoverageAccountRow({
  account,
  assessment
}: {
  account: RealEstateDataCoverageAccountAssessment;
  assessment: RealEstateMonthlyDataCoverageAssessment;
}) {
  return (
    <div className="grid gap-2 border-t border-border/70 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {account.institutionName ? `${account.institutionName} - ` : ""}
            {account.accountName}
          </p>
          {account.lastFour ? (
            <span className="text-xs font-semibold text-muted-foreground">
              **** {account.lastFour}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Checked {formatLastSynced(account.lastSyncedAt)}
        </p>
        {account.status === "needs_sync" ? (
          <div className="mt-2">
            <BankCoverageRangeSummary
              account={account}
              assessment={assessment}
              tone="missing"
            />
          </div>
        ) : (
          <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">
            Reconnect account to check coverage
          </p>
        )}
      </div>
      <span
        className={cn(
          "inline-flex h-7 w-fit items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold",
          account.status === "needs_reconnect"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-300"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300"
        )}
      >
        <CircleAlert className="h-3.5 w-3.5" />
        {account.status === "needs_reconnect" ? "Reconnect" : "Missing sync"}
      </span>
    </div>
  );
}

function BankCoverageDetails({
  assessment
}: {
  assessment: RealEstateMonthlyDataCoverageAssessment;
}) {
  if (
    assessment.status !== "needs_sync" &&
    assessment.status !== "needs_reconnect"
  ) {
    return null;
  }

  const accounts = assessment.accounts.filter(
    (account) =>
      account.status === "needs_sync" || account.status === "needs_reconnect"
  );

  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-secondary/60 px-3">
      {accounts.map((account) => (
        <BankCoverageAccountRow
          account={account}
          assessment={assessment}
          key={account.connectionId}
        />
      ))}
    </div>
  );
}

export function MonthlyReviewStatusPanel({
  assessment,
  closeAction,
  closeState,
  property,
  reopenAction,
  reopenState,
  reviewMonth,
  today
}: {
  assessment: MonthlyReviewAssessment;
  closeAction: (formData: FormData) => void;
  closeState: RealEstateActionState;
  property: RealEstateAssetDetail;
  reopenAction: (formData: FormData) => void;
  reopenState: RealEstateActionState;
  reviewMonth: string;
  today?: Date;
}) {
  const dataCoverageAssessment = getMonthlyDataCoverageAssessment(
    property,
    reviewMonth,
    today
  );
  const isReviewClosed = assessment.status === "closed";
  const isDataCoverageBlocked =
    !isReviewClosed && isMonthlyDataCoverageCloseBlocked(dataCoverageAssessment);
  const showBankCoverage =
    !isReviewClosed && dataCoverageAssessment.status !== "closed_accepted";
  const isCloseReady = assessment.isReadyToClose && !isDataCoverageBlocked;

  return (
    <div className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Close Status</h3>
            <span
              className={cn(
                "inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold",
                getOverallStatusClassName(assessment, isDataCoverageBlocked)
              )}
            >
              {getOverallStatusLabel(assessment, isDataCoverageBlocked)}
            </span>
          </div>
          {assessment.closedAt ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Closed {new Date(assessment.closedAt).toLocaleDateString("en-US")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <SubstatusBadge label="Rent" status={assessment.rentStatus} />
          <SubstatusBadge label="Expenses" status={assessment.expenseStatus} />
          {showBankCoverage ? (
            <BankCoverageBadge assessment={dataCoverageAssessment} />
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-2 sm:grid-cols-2",
          showBankCoverage ? "xl:grid-cols-4" : "xl:grid-cols-3"
        )}
      >
        <CloseMetric
          label="Rent"
          value={`${formatCurrency(assessment.rentCollected)} / ${formatCurrency(
            assessment.targetRent
          )}`}
        />
        <CloseMetric
          label="Expenses"
          value={`${formatCurrency(assessment.recordedExpenses)} · ${
            assessment.recordedExpenseCount
          } recorded`}
        />
        <CloseMetric
          label="Open Items"
          value={`${formatCountLabel(
            assessment.unclassifiedRentCreditCount,
            "rent credit",
            "rent credits"
          )} · ${formatCountLabel(
            assessment.unclassifiedExpenseCount,
            "debit",
            "debits"
          )} · ${formatCountLabel(
            assessment.ignoredExpenseCount,
            "ignored",
            "ignored"
          )}`}
        />
        {showBankCoverage ? (
          <CloseMetric
            label="Bank Coverage"
            value={getBankCoverageMetricValue(dataCoverageAssessment, today)}
          />
        ) : null}
      </div>

      {showBankCoverage ? (
        <BankCoverageDetails assessment={dataCoverageAssessment} />
      ) : null}

      {!assessment.isReviewMonthComplete ? (
        <p className="rounded-md border border-amber-100 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/35 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          This month is still in progress. Close it after the month ends so late-posted
          transactions are included.
        </p>
      ) : null}

      {assessment.missingExpenseCategoryCount > 0 ? (
        <p className="rounded-md border border-red-100 dark:border-red-900/60 bg-red-50 dark:bg-red-950/35 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
          {assessment.missingExpenseCategoryCount} expense{" "}
          {assessment.missingExpenseCategoryCount === 1 ? "transaction is" : "transactions are"}{" "}
          missing a category.
        </p>
      ) : null}

      {assessment.status === "closed" ? (
        <form action={reopenAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input name="reviewMonth" type="hidden" value={assessment.reviewMonth} />
          {assessment.note ? (
            <p className="min-w-0 flex-1 rounded-md border border-border/70 bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground">
              {assessment.note}
            </p>
          ) : (
            <div className="flex-1" />
          )}
          <ReopenMonthButton />
        </form>
      ) : (
        <form
          action={closeAction}
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
          key={assessment.reviewMonth}
        >
          <input name="reviewMonth" type="hidden" value={assessment.reviewMonth} />
          <label className="grid gap-2 text-sm font-semibold">
            Close Note
            <textarea
              className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={assessment.note ?? ""}
              name="note"
              placeholder="Optional close note"
            />
          </label>
          <CloseMonthButton disabled={!isCloseReady} />
        </form>
      )}

      {[closeState, reopenState].map((state, index) =>
        state.status === "error" && state.message ? (
          <p
            className="text-sm font-semibold text-red-600 dark:text-red-400"
            key={`${state.status}-${index}`}
          >
            {state.message}
          </p>
        ) : null
      )}
    </div>
  );
}

function ReviewMonthSelector({
  onReviewMonthChange,
  reviewMonth
}: {
  onReviewMonthChange: (month: string) => void;
  reviewMonth: string;
}) {
  return (
    <label className="inline-flex w-fit items-center">
      <span className="sr-only">Review Month</span>
      <input
        aria-label="Review month"
        className="h-9 w-36 rounded-md border border-border bg-secondary px-2.5 text-sm font-semibold text-foreground shadow-sm outline-none transition hover:border-input hover:bg-card focus:border-primary/50 focus:bg-card focus:ring-2 focus:ring-ring"
        onChange={(event) => onReviewMonthChange(event.target.value)}
        required
        type="month"
        value={reviewMonth}
      />
    </label>
  );
}

export function MonthlyReviewWorkspace({
  initialReviewMonth,
  property,
  propertyOptions
}: {
  initialReviewMonth?: string;
  property: RealEstateAssetDetail;
  propertyOptions: Array<Pick<RealEstateAssetDetail, "address" | "id" | "name">>;
}) {
  const router = useRouter();
  const [reviewMonth, setReviewMonth] = useState(
    initialReviewMonth ?? getCurrentMonth()
  );
  const [closeState, closeAction] = useActionState(
    closeMonthlyReview.bind(null, property.id),
    initialActionState
  );
  const [reopenState, reopenAction] = useActionState(
    reopenMonthlyReview.bind(null, property.id),
    initialActionState
  );
  const assessment = useMemo(
    () => getMonthlyReviewAssessment(property, reviewMonth),
    [property, reviewMonth]
  );
  const isReviewClosed = assessment.status === "closed";

  useEffect(() => {
    if (closeState.status !== "idle" || reopenState.status === "success") {
      router.refresh();
    }
  }, [closeState.status, reopenState.status, router]);

  useEffect(() => {
    if (initialReviewMonth) {
      setReviewMonth(initialReviewMonth);
    }
  }, [initialReviewMonth]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col items-start gap-4 space-y-0">
        <CardTitle>Monthly Review</CardTitle>
        <ReviewMonthSelector
          onReviewMonthChange={setReviewMonth}
          reviewMonth={reviewMonth}
        />
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          <div className="grid gap-6">
            <div className="grid content-start gap-5 rounded-md border border-border bg-secondary/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">Rent Collection</h3>
              <RentCollectionManager property={property} reviewMonth={reviewMonth} />
              <RentTransactionMatchPreview
                isReviewClosed={isReviewClosed}
                property={property}
                reviewMonth={reviewMonth}
              />
            </div>

            <div className="grid content-start gap-5 rounded-md border border-border bg-secondary/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Expense Transactions
              </h3>
              <ExpenseTransactionManager
                isReviewClosed={isReviewClosed}
                property={property}
                propertyOptions={propertyOptions}
                reviewMonth={reviewMonth}
              />
            </div>
          </div>

          <MonthlyReviewStatusPanel
            assessment={assessment}
            closeAction={closeAction}
            closeState={closeState}
            property={property}
            reopenAction={reopenAction}
            reopenState={reopenState}
            reviewMonth={reviewMonth}
          />
        </div>
      </CardContent>
    </Card>
  );
}
