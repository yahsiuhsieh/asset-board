"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, ChevronDown, RotateCcw, Search } from "lucide-react";

import {
  classifyRentCreditTransaction,
  previewRentTransactionMatches,
  type RealEstateActionState,
  type RentTransactionMatch,
  type RentTransactionMatchState,
  unclassifyPropertyTransaction
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import {
  getRentRecognitionMonth,
  RENT_TRANSACTION_SEARCH_BUFFER_DAYS
} from "@/lib/real-estate-monthly-review";
import { cn } from "@/lib/utils";
import type {
  RealEstateAssetDetail,
  RealEstatePropertyTransaction
} from "@/types/wealth";
import {
  CLOSED_REVIEW_ACTION_MESSAGE,
  ClosedReviewActionHint
} from "./ClosedReviewActionHint";

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
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function PreviewButton({
  disabled,
  disabledReason
}: {
  disabled: boolean;
  disabledReason?: string | null;
}) {
  const { pending } = useFormStatus();
  const button = (
    <Button
      className="min-w-[11rem] border border-primary/15 shadow-sm"
      disabled={disabled || pending}
      type="submit"
    >
      <Search className="h-4 w-4" />
      {pending ? "Finding" : "Find Rent Income"}
    </Button>
  );

  return (
    <ClosedReviewActionHint disabled={Boolean(disabledReason)} message={disabledReason ?? ""}>
      {button}
    </ClosedReviewActionHint>
  );
}

function MarkRentalIncomeButton({
  disabled,
  disabledReason
}: {
  disabled: boolean;
  disabledReason?: string | null;
}) {
  const { pending } = useFormStatus();
  const button = (
    <Button disabled={disabled || pending} size="sm" type="submit">
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Saving" : "Mark Rental Income"}
    </Button>
  );

  return (
    <ClosedReviewActionHint disabled={Boolean(disabledReason)} message={disabledReason ?? ""}>
      {button}
    </ClosedReviewActionHint>
  );
}

function NotRentalIncomeButton({
  disabled,
  disabledReason
}: {
  disabled: boolean;
  disabledReason?: string | null;
}) {
  const { pending } = useFormStatus();
  const button = (
    <Button disabled={disabled || pending} size="sm" type="submit" variant="secondary">
      <Ban className="h-4 w-4" />
      {pending ? "Saving" : "Not Rental Income"}
    </Button>
  );

  return (
    <ClosedReviewActionHint disabled={Boolean(disabledReason)} message={disabledReason ?? ""}>
      {button}
    </ClosedReviewActionHint>
  );
}

function RentMatchAction({
  isReviewClosed,
  match,
  matchMonth,
  onClassified,
  propertyId
}: {
  isReviewClosed: boolean;
  match: RentTransactionMatch;
  matchMonth: string;
  onClassified: (matchKey: string) => void;
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
  const matchKey = getRentMatchKey(match);
  const disabledReason = isReviewClosed ? CLOSED_REVIEW_ACTION_MESSAGE : null;

  useEffect(() => {
    if (rentalIncomeState.status === "success" || ignoredState.status === "success") {
      onClassified(matchKey);
      router.refresh();
    }
  }, [
    ignoredState.status,
    matchKey,
    onClassified,
    rentalIncomeState.status,
    router
  ]);

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
        <form action={rentalIncomeAction} className="flex flex-wrap items-center gap-2">
          <input name="transactionId" type="hidden" value={match.id} />
          <input name="connectionId" type="hidden" value={match.connectionId} />
          <input
            name="rawBankTransactionId"
            type="hidden"
            value={match.rawBankTransactionId ?? ""}
          />
          <input
            name="recordedTransactionId"
            type="hidden"
            value={match.recordedTransactionId ?? ""}
          />
          <input name="matchMonth" type="hidden" value={matchMonth} />
          <input name="classification" type="hidden" value="rental_income" />
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Apply to
            <ClosedReviewActionHint disabled={isReviewClosed}>
              <input
                className="h-8 w-32 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-ring"
                defaultValue={match.rentPeriodMonth ?? matchMonth}
                disabled={isReviewClosed}
                name="rentPeriodMonth"
                required
                type="month"
              />
            </ClosedReviewActionHint>
          </label>
          <MarkRentalIncomeButton
            disabled={isReviewClosed}
            disabledReason={disabledReason}
          />
        </form>
        <form action={ignoredAction}>
          <input name="transactionId" type="hidden" value={match.id} />
          <input name="connectionId" type="hidden" value={match.connectionId} />
          <input
            name="rawBankTransactionId"
            type="hidden"
            value={match.rawBankTransactionId ?? ""}
          />
          <input
            name="recordedTransactionId"
            type="hidden"
            value={match.recordedTransactionId ?? ""}
          />
          <input name="matchMonth" type="hidden" value={matchMonth} />
          <input
            name="rentPeriodMonth"
            type="hidden"
            value={match.rentPeriodMonth ?? matchMonth}
          />
          <input name="classification" type="hidden" value="ignored" />
          <NotRentalIncomeButton
            disabled={isReviewClosed}
            disabledReason={disabledReason}
          />
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

function getStoredTransactionConnectionId(
  transaction: RealEstatePropertyTransaction
): string {
  return transaction.bankConnectionId ?? transaction.provider;
}

function getRentMatchKey(match: RentTransactionMatch): string {
  if (match.rawBankTransactionId) {
    return `raw:${match.rawBankTransactionId}`;
  }

  return `${match.connectionId}:${match.id}`;
}

function transactionMatchesTargetRange(
  amount: number,
  expectedAmount: number,
  tolerance: number
): boolean {
  return amount >= expectedAmount - tolerance && amount <= expectedAmount + tolerance;
}

function getStoredPendingRentMatch(
  transaction: RealEstatePropertyTransaction,
  property: RealEstateAssetDetail
): RentTransactionMatch {
  return {
    id: transaction.providerTransactionId,
    connectionId: getStoredTransactionConnectionId(transaction),
    rawBankTransactionId: transaction.rawBankTransactionId,
    postedAt: transaction.postedAt,
    title: transaction.description,
    memo: transaction.memo ?? "",
    description: transaction.description,
    amount: transaction.amount,
    accountName: transaction.accountName,
    classification: null,
    recordedTransactionId: transaction.id,
    rentPeriodMonth: transaction.rentPeriodMonth,
    amountMatchesTarget: transactionMatchesTargetRange(
      transaction.amount,
      property.monthlyRent,
      property.rentMatchTolerance
    )
  };
}

function ClassifiedRentTransactionList({
  assetId,
  isReviewClosed,
  transactions
}: {
  assetId: string;
  isReviewClosed: boolean;
  transactions: RealEstatePropertyTransaction[];
}) {
  if (transactions.length === 0) {
    return (
      <div className="flex min-h-[4.5rem] items-center rounded-md border border-slate-200 p-4 text-sm font-semibold text-muted-foreground">
        No classified rent income transactions for this month.
      </div>
    );
  }

  return (
    <details className="group overflow-hidden rounded-md border border-slate-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Classified Transactions ({transactions.length})</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100">
        {transactions.map((transaction) => (
          <div
            className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-0 md:grid-cols-[minmax(0,1fr)_7rem_6rem] md:items-center"
            key={transaction.id}
          >
            <div className="min-w-0">
              <p className="break-words font-semibold">{transaction.description}</p>
              <p className="mt-1 font-medium text-muted-foreground">
                {transaction.accountName} · {transaction.postedAt}
              </p>
              <p className="mt-1 text-muted-foreground">
                Rental income · applies to {getRentRecognitionMonth(transaction)}
              </p>
            </div>
            <p className="font-semibold tabular-nums md:justify-self-end md:text-right">
              {formatCurrency(transaction.amount)}
            </p>
            <form
              action={unclassifyPropertyTransaction}
              className="md:col-start-3 md:justify-self-end"
            >
              <input name="assetId" type="hidden" value={assetId} />
              <input name="transactionId" type="hidden" value={transaction.id} />
              <ClosedReviewActionHint disabled={isReviewClosed}>
                <button
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:text-slate-400"
                  disabled={isReviewClosed}
                  type="submit"
                >
                  <RotateCcw className="h-4 w-4" />
                  Unclassify
                </button>
              </ClosedReviewActionHint>
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}

function IgnoredRentTransactionList({
  assetId,
  isReviewClosed,
  transactions
}: {
  assetId: string;
  isReviewClosed: boolean;
  transactions: RealEstatePropertyTransaction[];
}) {
  if (transactions.length === 0) {
    return null;
  }

  return (
    <details className="group overflow-hidden rounded-md border border-slate-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Ignored Transactions ({transactions.length})</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100">
        {transactions.map((transaction) => (
          <div
            className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-0 md:grid-cols-[minmax(0,1fr)_7rem_6rem] md:items-center"
            key={transaction.id}
          >
            <div className="min-w-0">
              <p className="break-words font-semibold">{transaction.description}</p>
              <p className="mt-1 font-medium text-muted-foreground">
                {transaction.accountName} · {transaction.postedAt}
              </p>
              <p className="mt-1 text-muted-foreground">Not rental income</p>
            </div>
            <p className="font-semibold tabular-nums md:justify-self-end md:text-right">
              {formatCurrency(transaction.amount)}
            </p>
            <form
              action={unclassifyPropertyTransaction}
              className="md:col-start-3 md:justify-self-end"
            >
              <input name="assetId" type="hidden" value={assetId} />
              <input name="transactionId" type="hidden" value={transaction.id} />
              <ClosedReviewActionHint disabled={isReviewClosed}>
                <button
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:text-slate-400"
                  disabled={isReviewClosed}
                  type="submit"
                >
                  <RotateCcw className="h-4 w-4" />
                  Review Again
                </button>
              </ClosedReviewActionHint>
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}

export function RentTransactionMatchPreview({
  isReviewClosed,
  property,
  reviewMonth
}: {
  isReviewClosed: boolean;
  property: RealEstateAssetDetail;
  reviewMonth: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    previewRentTransactionMatches.bind(null, property.id),
    initialState
  );
  const [hiddenMatchKeys, setHiddenMatchKeys] = useState<Set<string>>(new Set());
  const selectedMatchMonth = reviewMonth;
  const hasActiveBankConnection = property.bankConnections.some(
    (connection) => connection.status === "active"
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  useEffect(() => {
    setHiddenMatchKeys(new Set());
  }, [selectedMatchMonth]);

  const handleClassified = useCallback((matchKey: string) => {
    setHiddenMatchKeys((currentKeys) => {
      if (currentKeys.has(matchKey)) {
        return currentKeys;
      }

      const nextKeys = new Set(currentKeys);
      nextKeys.add(matchKey);
      return nextKeys;
    });
  }, []);
  const storedPendingRentMatches = property.propertyTransactions
    .filter(
      (transaction) =>
        transaction.direction === "credit" &&
        transaction.classification == null &&
        getRentRecognitionMonth(transaction) === selectedMatchMonth
    )
    .map((transaction) => getStoredPendingRentMatch(transaction, property));
  const visibleMatches = [
    ...storedPendingRentMatches,
    ...state.matches.filter(
      (match) =>
        match.classification == null &&
        state.matchMonth === selectedMatchMonth
    )
  ].filter(
    (match, index, matches) =>
      !hiddenMatchKeys.has(getRentMatchKey(match)) &&
      matches.findIndex(
        (candidate) => getRentMatchKey(candidate) === getRentMatchKey(match)
      ) === index
  );
  const classifiedReviewMonthTransactions = property.propertyTransactions.filter(
    (transaction) =>
      transaction.direction === "credit" &&
      transaction.classification === "rental_income" &&
      getRentRecognitionMonth(transaction) === selectedMatchMonth
  );
  const ignoredReviewMonthTransactions = property.propertyTransactions.filter(
    (transaction) =>
      transaction.direction === "credit" &&
      transaction.classification === "ignored" &&
      getRentRecognitionMonth(transaction) === selectedMatchMonth
  );
  const shouldShowPreviewMessage =
    state.message && (!state.matchMonth || state.matchMonth === selectedMatchMonth);

  return (
    <div className="grid gap-5 border-t border-slate-100 pt-5">
      <form action={formAction} className="grid gap-4">
        <div className="grid min-h-10 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <input name="matchMonth" type="hidden" value={selectedMatchMonth} />
          <PreviewButton
            disabled={!hasActiveBankConnection || isReviewClosed}
            disabledReason={isReviewClosed ? CLOSED_REVIEW_ACTION_MESSAGE : null}
          />
          <p className="min-w-0 text-sm font-medium leading-5 text-muted-foreground">
            Rent auto-match:{" "}
            <strong className="font-semibold text-slate-700">
              {RENT_TRANSACTION_SEARCH_BUFFER_DAYS}-day
            </strong>{" "}
            window ·{" "}
            <strong className="font-semibold text-slate-700">{selectedMatchMonth}</strong>{" "}
            ·{" "}
            <strong className="font-semibold text-slate-700">
              ±{formatCurrency(property.rentMatchTolerance)}
            </strong>.
          </p>
        </div>
      </form>

      {!hasActiveBankConnection ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-muted-foreground">
          No bank connection. Connect account to review transactions.
        </div>
      ) : null}

      {isReviewClosed ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-muted-foreground">
          Reopen this monthly review before changing rent transactions.
        </div>
      ) : null}

      {shouldShowPreviewMessage ? (
        <p
          className={cn(
            "text-sm font-semibold",
            state.status === "error" ? "text-red-600" : "text-emerald-600"
          )}
        >
          {state.message}
        </p>
      ) : null}

      {visibleMatches.length > 0 ? (
        <details className="group overflow-hidden rounded-md border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>
              Income Transactions ({visibleMatches.length})
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100">
            {visibleMatches.map((match) => (
              <div
                className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                key={getRentMatchKey(match)}
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
                  isReviewClosed={isReviewClosed}
                  match={match}
                  matchMonth={selectedMatchMonth}
                  onClassified={handleClassified}
                  propertyId={property.id}
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="grid gap-3 border-t border-slate-100 pt-5">
        <ClassifiedRentTransactionList
          assetId={property.id}
          isReviewClosed={isReviewClosed}
          transactions={classifiedReviewMonthTransactions}
        />
        <IgnoredRentTransactionList
          assetId={property.id}
          isReviewClosed={isReviewClosed}
          transactions={ignoredReviewMonthTransactions}
        />
      </div>
    </div>
  );
}
