"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, RotateCcw } from "lucide-react";

import {
  closeMonthlyReview,
  reopenMonthlyReview,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
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

function getOverallStatusLabel(assessment: MonthlyReviewAssessment): string {
  if (assessment.status === "closed") {
    return "Closed";
  }

  if (assessment.status === "ready_to_close") {
    return "Ready to close";
  }

  return "Open";
}

function getOverallStatusClassName(assessment: MonthlyReviewAssessment): string {
  if (assessment.status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (assessment.status === "ready_to_close") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
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
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      )}
    >
      {isReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      {label}: {isReady ? "Ready" : "Needs review"}
    </span>
  );
}

function CloseMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MonthlyReviewStatusPanel({
  assessment,
  closeAction,
  closeState,
  reopenAction,
  reopenState
}: {
  assessment: MonthlyReviewAssessment;
  closeAction: (formData: FormData) => void;
  closeState: RealEstateActionState;
  reopenAction: (formData: FormData) => void;
  reopenState: RealEstateActionState;
}) {
  return (
    <div className="grid gap-4 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Close Status</h3>
            <span
              className={cn(
                "inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold",
                getOverallStatusClassName(assessment)
              )}
            >
              {getOverallStatusLabel(assessment)}
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
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CloseMetric
          label="Period"
          value={assessment.isReviewMonthComplete ? "Complete" : "In progress"}
        />
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
      </div>

      {!assessment.isReviewMonthComplete ? (
        <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          This month is still in progress. Close it after the month ends so late-posted
          transactions are included.
        </p>
      ) : null}

      {assessment.missingExpenseCategoryCount > 0 ? (
        <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {assessment.missingExpenseCategoryCount} expense{" "}
          {assessment.missingExpenseCategoryCount === 1 ? "transaction is" : "transactions are"}{" "}
          missing a category.
        </p>
      ) : null}

      {assessment.status === "closed" ? (
        <form action={reopenAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input name="reviewMonth" type="hidden" value={assessment.reviewMonth} />
          {assessment.note ? (
            <p className="min-w-0 flex-1 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-muted-foreground">
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
              className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={assessment.note ?? ""}
              name="note"
              placeholder="Optional close note"
            />
          </label>
          <CloseMonthButton disabled={!assessment.isReadyToClose} />
        </form>
      )}

      {[closeState, reopenState].map((state, index) =>
        state.status === "error" && state.message ? (
          <p
            className="text-sm font-semibold text-red-600"
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
        className="h-9 w-36 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-300 hover:bg-white focus:border-primary/50 focus:bg-white focus:ring-2 focus:ring-ring"
        onChange={(event) => onReviewMonthChange(event.target.value)}
        required
        type="month"
        value={reviewMonth}
      />
    </label>
  );
}

export function MonthlyReviewWorkspace({
  property,
  propertyOptions
}: {
  property: RealEstateAssetDetail;
  propertyOptions: Array<Pick<RealEstateAssetDetail, "address" | "id" | "name">>;
}) {
  const router = useRouter();
  const [reviewMonth, setReviewMonth] = useState(getCurrentMonth());
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

  return (
    <Card className="border-slate-200 bg-white">
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
            <div className="grid content-start gap-5 rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Rent Collection</h3>
              <RentCollectionManager property={property} reviewMonth={reviewMonth} />
              <RentTransactionMatchPreview
                isReviewClosed={isReviewClosed}
                property={property}
                reviewMonth={reviewMonth}
              />
            </div>

            <div className="grid content-start gap-5 rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
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
            reopenAction={reopenAction}
            reopenState={reopenState}
          />
        </div>
      </CardContent>
    </Card>
  );
}
