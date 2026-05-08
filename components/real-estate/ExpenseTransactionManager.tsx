"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Search,
  Trash2
} from "lucide-react";

import {
  classifyPropertyTransaction,
  deletePropertyTransaction,
  previewExpenseTransactions,
  type ExpenseTransactionPreview,
  type ExpenseTransactionPreviewState,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import {
  expenseCategoryLabels,
  getExpenseTransactionsForMonth,
  getRecordedExpensesForMonth
} from "@/lib/real-estate-expenses";
import { cn } from "@/lib/utils";
import type {
  RealEstateAssetDetail,
  RealEstateExpenseCategory,
  RealEstatePropertyTransaction
} from "@/types/wealth";

const removeTransactionConfirmation =
  "Remove only deletes this ledger record. If this bank transaction still exists, it may return during Find Transactions or Close Month. Use Ignore to exclude normal bank transactions.";

const initialPreviewState: ExpenseTransactionPreviewState = {
  status: "idle",
  message: "",
  provider: "",
  reviewMonth: "",
  transactions: []
};

const initialActionState: RealEstateActionState = {
  status: "idle",
  message: ""
};

const categoryOptions: RealEstateExpenseCategory[] = [
  "taxes",
  "insurance",
  "maintenance",
  "hoa",
  "utilities",
  "other"
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function PreviewButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="min-w-[11rem] border border-primary/15 shadow-sm"
      disabled={disabled || pending}
      type="submit"
    >
      <Search className="h-4 w-4" />
      {pending ? "Finding" : "Find Transactions"}
    </Button>
  );
}

function RecordExpenseButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit">
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Recording" : "Record Expense"}
    </Button>
  );
}

function IgnoreButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="secondary">
      <Ban className="h-4 w-4" />
      {pending ? "Ignoring" : "Ignore"}
    </Button>
  );
}

function getPreviewTransactionKey(transaction: ExpenseTransactionPreview): string {
  return `${transaction.connectionId}:${transaction.id}`;
}

function getStoredTransactionConnectionId(
  transaction: RealEstatePropertyTransaction
): string {
  return transaction.bankConnectionId ?? transaction.provider;
}

function getStoredPendingExpensePreview(
  transaction: RealEstatePropertyTransaction
): ExpenseTransactionPreview {
  return {
    id: transaction.providerTransactionId,
    connectionId: getStoredTransactionConnectionId(transaction),
    postedAt: transaction.postedAt,
    description: transaction.description,
    amount: transaction.amount,
    accountName: transaction.accountName,
    classification: null,
    recordedTransactionId: transaction.id
  };
}

function ExpenseTransactionActions({
  onClassified,
  propertyId,
  reviewMonth,
  transaction,
  transactionKey
}: {
  onClassified: (transactionKey: string) => void;
  propertyId: string;
  reviewMonth: string;
  transaction: ExpenseTransactionPreview;
  transactionKey: string;
}) {
  const router = useRouter();
  const [expenseState, expenseAction] = useActionState(
    classifyPropertyTransaction.bind(null, propertyId),
    initialActionState
  );
  const [ignoreState, ignoreAction] = useActionState(
    classifyPropertyTransaction.bind(null, propertyId),
    initialActionState
  );
  const state = expenseState.message ? expenseState : ignoreState;

  useEffect(() => {
    if (expenseState.status === "success" || ignoreState.status === "success") {
      onClassified(transactionKey);
      router.refresh();
    }
  }, [
    expenseState.status,
    ignoreState.status,
    onClassified,
    router,
    transactionKey
  ]);

  if (transaction.classification) {
    return (
      <div className="w-fit justify-self-start rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-muted-foreground md:justify-self-end">
        {transaction.classification === "expense" ? "Recorded expense" : "Ignored"}
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0 gap-2 justify-items-start lg:w-auto lg:justify-items-end">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:justify-end">
        <form action={expenseAction} className="contents">
          <input
            name="recordedTransactionId"
            type="hidden"
            value={transaction.recordedTransactionId ?? ""}
          />
          <input name="transactionId" type="hidden" value={transaction.id} />
          <input name="connectionId" type="hidden" value={transaction.connectionId} />
          <input name="reviewMonth" type="hidden" value={reviewMonth} />
          <input name="classification" type="hidden" value="expense" />
          <select
            className="h-9 w-40 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
            defaultValue="other"
            name="category"
          >
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {expenseCategoryLabels[category]}
              </option>
            ))}
          </select>
          <RecordExpenseButton />
        </form>
        <form action={ignoreAction}>
          <input
            name="recordedTransactionId"
            type="hidden"
            value={transaction.recordedTransactionId ?? ""}
          />
          <input name="transactionId" type="hidden" value={transaction.id} />
          <input name="connectionId" type="hidden" value={transaction.connectionId} />
          <input name="reviewMonth" type="hidden" value={reviewMonth} />
          <input name="classification" type="hidden" value="ignored" />
          <IgnoreButton />
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

function ClassifiedTransactionList({
  assetId,
  transactions
}: {
  assetId: string;
  transactions: RealEstatePropertyTransaction[];
}) {
  if (transactions.length === 0) {
    return (
      <div className="flex min-h-[4.5rem] items-center rounded-md border border-slate-200 p-4 text-sm font-semibold text-muted-foreground">
        No classified expense transactions for this month.
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
                {transaction.category ? expenseCategoryLabels[transaction.category] : "Expense"}
              </p>
            </div>
            <p className="font-semibold tabular-nums md:justify-self-end md:text-right">
              {formatCurrency(transaction.amount)}
            </p>
            <form
              action={deletePropertyTransaction}
              className="md:col-start-3 md:justify-self-end"
              onSubmit={(event) => {
                if (!window.confirm(removeTransactionConfirmation)) {
                  event.preventDefault();
                }
              }}
            >
              <input name="assetId" type="hidden" value={assetId} />
              <input name="transactionId" type="hidden" value={transaction.id} />
              <button
                className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"
                type="submit"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}

function IgnoredTransactionList({
  assetId,
  transactions
}: {
  assetId: string;
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
              <p className="mt-1 text-muted-foreground">Ignored</p>
            </div>
            <p className="font-semibold tabular-nums md:justify-self-end md:text-right">
              {formatCurrency(transaction.amount)}
            </p>
            <form
              action={deletePropertyTransaction}
              className="md:col-start-3 md:justify-self-end"
              onSubmit={(event) => {
                if (!window.confirm(removeTransactionConfirmation)) {
                  event.preventDefault();
                }
              }}
            >
              <input name="assetId" type="hidden" value={assetId} />
              <input name="transactionId" type="hidden" value={transaction.id} />
              <button
                className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"
                type="submit"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}

export function ExpenseTransactionManager({
  property,
  reviewMonth
}: {
  property: RealEstateAssetDetail;
  reviewMonth: string;
}) {
  const [state, formAction] = useActionState(
    previewExpenseTransactions.bind(null, property.id),
    initialPreviewState
  );
  const [hiddenPreviewTransactionKeys, setHiddenPreviewTransactionKeys] = useState<
    Set<string>
  >(new Set());
  const selectedReviewMonth = reviewMonth;
  const hasActiveBankConnection = property.bankConnections.some(
    (connection) => connection.status === "active"
  );

  useEffect(() => {
    setHiddenPreviewTransactionKeys(new Set());
  }, [selectedReviewMonth]);

  useEffect(() => {
    if (state.status !== "success" || state.reviewMonth !== selectedReviewMonth) {
      return;
    }

    const returnedTransactionKeys = new Set(state.transactions.map(getPreviewTransactionKey));

    if (returnedTransactionKeys.size === 0) {
      return;
    }

    setHiddenPreviewTransactionKeys((currentKeys) => {
      let changed = false;
      const nextKeys = new Set(currentKeys);

      returnedTransactionKeys.forEach((transactionKey) => {
        if (nextKeys.delete(transactionKey)) {
          changed = true;
        }
      });

      return changed ? nextKeys : currentKeys;
    });
  }, [selectedReviewMonth, state.reviewMonth, state.status, state.transactions]);

  const handleClassified = useCallback((transactionKey: string) => {
    setHiddenPreviewTransactionKeys((currentKeys) => {
      if (currentKeys.has(transactionKey)) {
        return currentKeys;
      }

      const nextKeys = new Set(currentKeys);
      nextKeys.add(transactionKey);
      return nextKeys;
    });
  }, []);
  const reviewMonthTransactions = property.propertyTransactions.filter(
    (transaction) =>
      transaction.direction === "debit" &&
      transaction.postedAt.slice(0, 7) === selectedReviewMonth
  );
  const storedPendingExpensePreviews = reviewMonthTransactions
    .filter((transaction) => transaction.classification == null)
    .map(getStoredPendingExpensePreview);
  const visiblePreviewTransactions = [
    ...storedPendingExpensePreviews,
    ...state.transactions.filter(
      (transaction) => transaction.postedAt.slice(0, 7) === selectedReviewMonth
    )
  ].filter(
    (transaction, index, transactions) =>
      !hiddenPreviewTransactionKeys.has(getPreviewTransactionKey(transaction)) &&
      transactions.findIndex(
        (candidate) =>
          getPreviewTransactionKey(candidate) === getPreviewTransactionKey(transaction)
      ) === index
  );
  const classifiedReviewMonthTransactions = reviewMonthTransactions.filter(
    (transaction) => transaction.classification === "expense"
  );
  const ignoredReviewMonthTransactions = reviewMonthTransactions.filter(
    (transaction) => transaction.classification === "ignored"
  );
  const recordedExpenses = getRecordedExpensesForMonth(
    property.propertyTransactions,
    selectedReviewMonth
  );
  const recordedExpenseCount = getExpenseTransactionsForMonth(
    property.propertyTransactions,
    selectedReviewMonth
  ).length;
  const ignoredCount = ignoredReviewMonthTransactions.length;
  const shouldShowPreviewMessage =
    state.message && (!state.reviewMonth || state.reviewMonth === selectedReviewMonth);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-secondary p-4">
          <p className="text-sm font-semibold text-muted-foreground">
            Selected Month Expenses
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {formatCurrency(recordedExpenses)}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-secondary p-4">
          <p className="text-sm font-semibold text-muted-foreground">
            Expense Transactions
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {recordedExpenseCount}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-secondary p-4">
          <p className="text-sm font-semibold text-muted-foreground">Ignored</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{ignoredCount}</p>
        </div>
      </div>

      <form action={formAction} className="grid gap-4 border-t border-slate-100 pt-5">
        <div className="grid min-h-10 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <input name="reviewMonth" type="hidden" value={selectedReviewMonth} />
          <PreviewButton disabled={!hasActiveBankConnection} />
          <p className="min-w-0 text-sm font-medium leading-5 text-muted-foreground">
            Expense search:{" "}
            <strong className="font-semibold text-slate-700">posted debits</strong>{" "}
            ·{" "}
            <strong className="font-semibold text-slate-700">
              {selectedReviewMonth}
            </strong>.
          </p>
        </div>
      </form>

      {!hasActiveBankConnection ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-muted-foreground">
          No bank connection. Connect account to review transactions.
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

      {visiblePreviewTransactions.length > 0 ? (
        <details className="group overflow-hidden rounded-md border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>
              Unclassified Transactions ({visiblePreviewTransactions.length})
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100">
            {visiblePreviewTransactions.map((transaction) => {
              const transactionKey = getPreviewTransactionKey(transaction);

              return (
                <div
                  className="grid min-w-0 gap-3 border-b border-slate-100 p-4 text-sm last:border-0 lg:grid-cols-[minmax(0,1fr)_7rem_auto] lg:items-center"
                  key={transactionKey}
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{transaction.description}</p>
                    <p className="mt-1 font-medium text-muted-foreground">
                      {transaction.accountName} · {transaction.postedAt}
                    </p>
                  </div>
                  <p className="font-semibold lg:justify-self-end">
                    {formatCurrency(transaction.amount)}
                  </p>
                  <ExpenseTransactionActions
                    onClassified={handleClassified}
                    propertyId={property.id}
                    reviewMonth={selectedReviewMonth}
                    transaction={transaction}
                    transactionKey={transactionKey}
                  />
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      <div className="grid gap-3 border-t border-slate-100 pt-5">
        <ClassifiedTransactionList
          assetId={property.id}
          transactions={classifiedReviewMonthTransactions}
        />
        <IgnoredTransactionList
          assetId={property.id}
          transactions={ignoredReviewMonthTransactions}
        />
      </div>
    </div>
  );
}
