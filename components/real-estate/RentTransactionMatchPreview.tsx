"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, ChevronDown, Search } from "lucide-react";

import {
  classifyRentCreditTransaction,
  previewRentTransactionMatches,
  type RealEstateActionState,
  type RentTransactionMatch,
  type RentTransactionMatchState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAssetDetail } from "@/types/wealth";

const initialState: RentTransactionMatchState = {
  status: "idle",
  message: "",
  provider: "",
  matchMonth: "",
  matches: []
};

const applyInitialState: RealEstateActionState = {
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

function getCurrentMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

function PreviewButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="secondary">
      <Search className="h-4 w-4" />
      {pending ? "Reviewing" : "Review Credits"}
    </Button>
  );
}

function MarkRentalIncomeButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit">
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Saving" : "Mark Rental Income"}
    </Button>
  );
}

function NotRentalIncomeButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="secondary">
      <Ban className="h-4 w-4" />
      {pending ? "Saving" : "Not Rental Income"}
    </Button>
  );
}

function RentMatchAction({
  match,
  matchMonth,
  propertyId
}: {
  match: RentTransactionMatch;
  matchMonth: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [rentalIncomeState, rentalIncomeAction] = useActionState(
    classifyRentCreditTransaction.bind(null, propertyId),
    applyInitialState
  );
  const [ignoredState, ignoredAction] = useActionState(
    classifyRentCreditTransaction.bind(null, propertyId),
    applyInitialState
  );
  const state = rentalIncomeState.message ? rentalIncomeState : ignoredState;

  useEffect(() => {
    if (rentalIncomeState.status === "success" || ignoredState.status === "success") {
      router.refresh();
    }
  }, [ignoredState.status, rentalIncomeState.status, router]);

  if (state.status === "success") {
    return (
      <p className="justify-self-start rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-muted-foreground md:justify-self-end">
        {state.message}
      </p>
    );
  }

  if (match.classification === "rental_income") {
    return (
      <p className="justify-self-start rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 md:justify-self-end">
        {match.amountMatchesTarget ? "Auto-recorded rental income" : "Rental income"}
      </p>
    );
  }

  if (match.classification === "ignored") {
    return (
      <p className="justify-self-start rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-muted-foreground md:justify-self-end">
        Not rental income
      </p>
    );
  }

  return (
    <div className="grid w-full min-w-0 gap-2 justify-items-start md:justify-items-end">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:justify-end">
        <form action={rentalIncomeAction}>
          <input name="transactionId" type="hidden" value={match.id} />
          <input name="connectionId" type="hidden" value={match.connectionId} />
          <input name="matchMonth" type="hidden" value={matchMonth} />
          <input name="classification" type="hidden" value="rental_income" />
          <MarkRentalIncomeButton />
        </form>
        <form action={ignoredAction}>
          <input name="transactionId" type="hidden" value={match.id} />
          <input name="connectionId" type="hidden" value={match.connectionId} />
          <input name="matchMonth" type="hidden" value={matchMonth} />
          <input name="classification" type="hidden" value="ignored" />
          <NotRentalIncomeButton />
        </form>
      </div>
      {state.message ? (
        <p
          className={cn(
            "max-w-full text-xs font-semibold",
            state.status === "error" ? "text-red-600" : "text-emerald-600"
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function RentTransactionMatchPreview({
  property
}: {
  property: RealEstateAssetDetail;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    previewRentTransactionMatches.bind(null, property.id),
    initialState
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <div className="grid gap-4 border-t border-slate-100 pt-5">
      <form action={formAction} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-[12rem_auto] md:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            Match Month
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={getCurrentMonth()}
              name="matchMonth"
              required
              type="month"
            />
          </label>
          <PreviewButton />
        </div>
      </form>

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

      {state.matches.length > 0 ? (
        <details className="group overflow-hidden rounded-md border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>
              Credit Transactions ({state.matches.length})
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100">
            {state.matches.map((match) => (
              <div
                className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                key={match.id}
              >
                <div>
                  <p className="text-sm font-semibold">{match.description}</p>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {match.accountName} · {match.postedAt}
                  </p>
                  {match.amountMatchesTarget ? (
                    <p className="mt-1 text-xs font-semibold text-emerald-600">
                      Matches target rent range
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold">{formatCurrency(match.amount)}</p>
                <RentMatchAction
                  match={match}
                  matchMonth={state.matchMonth}
                  propertyId={property.id}
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
