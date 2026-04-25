"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";

import {
  addExpenseItem,
  deleteExpenseItem,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import {
  expenseCategoryLabels,
  expenseFrequencyLabels,
  getAnnualScheduledExpenses,
  getExpenseAnnualTotal,
  getExpenseMonthlyAverage,
  getMonthlyAverageExpenses
} from "@/lib/real-estate-expenses";
import { cn } from "@/lib/utils";
import type {
  ExpenseFrequency,
  RealEstateExpenseCategory,
  RealEstateExpenseItem
} from "@/types/wealth";

const initialState: RealEstateActionState = {
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

const frequencyOptions: ExpenseFrequency[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual"
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <Plus className="h-4 w-4" />
      {pending ? "Saving" : "Add Expense"}
    </Button>
  );
}

export function ExpenseScheduleManager({
  assetId,
  expenses
}: {
  assetId: string;
  expenses: RealEstateExpenseItem[];
}) {
  const [state, formAction] = useActionState(addExpenseItem.bind(null, assetId), initialState);
  const monthlyAverage = getMonthlyAverageExpenses(expenses);
  const annualTotal = getAnnualScheduledExpenses(expenses);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-secondary p-4">
          <p className="text-sm font-semibold text-muted-foreground">Monthly Average</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {formatCurrency(monthlyAverage)}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-secondary p-4">
          <p className="text-sm font-semibold text-muted-foreground">Annual Scheduled Total</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {formatCurrency(annualTotal)}
          </p>
        </div>
      </div>

      <form action={formAction} className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2 text-sm font-semibold">
            Name
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              name="name"
              placeholder="Property taxes"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Category
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
              name="category"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {expenseCategoryLabels[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Amount
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              inputMode="decimal"
              min="0"
              name="amount"
              placeholder="0"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Frequency
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
              name="frequency"
            >
              {frequencyOptions.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {expenseFrequencyLabels[frequency]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[12rem_1fr_auto] md:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            Paid month
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              max="12"
              min="1"
              name="paidMonth"
              placeholder="Optional"
              type="number"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Note
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              name="note"
              placeholder="Optional"
            />
          </label>
          <SubmitButton />
        </div>
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
      </form>

      <div className="overflow-hidden rounded-md border border-slate-200">
        {expenses.length > 0 ? (
          expenses.map((expense) => (
            <div
              className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-0 md:grid-cols-[1fr_auto_auto_auto]"
              key={expense.id}
            >
              <div>
                <p className="font-semibold">{expense.name}</p>
                <p className="mt-1 text-muted-foreground">
                  {expenseCategoryLabels[expense.category]} ·{" "}
                  {expenseFrequencyLabels[expense.frequency]}
                  {expense.paidMonth ? ` · month ${expense.paidMonth}` : ""}
                </p>
                {expense.note ? (
                  <p className="mt-1 text-muted-foreground">{expense.note}</p>
                ) : null}
              </div>
              <p className="font-semibold">{formatCurrency(expense.amount)}</p>
              <p className="text-muted-foreground">
                {formatCurrency(getExpenseMonthlyAverage(expense))}/mo ·{" "}
                {formatCurrency(getExpenseAnnualTotal(expense))}/yr
              </p>
              <form action={deleteExpenseItem}>
                <input name="assetId" type="hidden" value={assetId} />
                <input name="expenseId" type="hidden" value={expense.id} />
                <button
                  className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"
                  type="submit"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </form>
            </div>
          ))
        ) : (
          <div className="p-4 text-sm font-semibold text-muted-foreground">
            No scheduled expenses yet.
          </div>
        )}
      </div>
    </div>
  );
}
