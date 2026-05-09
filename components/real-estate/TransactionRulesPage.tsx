"use client";

import { useActionState, useEffect, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleOff, Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  createRealEstateTransactionRule,
  deactivateRealEstateTransactionRule,
  deleteRealEstateTransactionRule,
  reactivateRealEstateTransactionRule,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { expenseCategoryLabels } from "@/lib/real-estate-expenses";
import { cn } from "@/lib/utils";
import type {
  RealEstateAsset,
  RealEstateExpenseCategory,
  RealEstateTransactionRule
} from "@/types/wealth";
import { RealEstatePortfolioNav } from "./RealEstatePortfolioNav";

interface TransactionRulesPageProps {
  properties: RealEstateAsset[];
  rules: RealEstateTransactionRule[];
}

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
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function CreateRuleButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <Plus className="h-4 w-4" />
      {pending ? "Creating" : "Create Rule"}
    </Button>
  );
}

function DeactivateRuleButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="secondary">
      <CircleOff className="h-4 w-4" />
      {pending ? "Deactivating" : "Deactivate"}
    </Button>
  );
}

function ReactivateRuleButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="secondary">
      <RotateCcw className="h-4 w-4" />
      {pending ? "Reactivating" : "Reactivate"}
    </Button>
  );
}

function DeleteRuleButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="text-red-600 hover:text-red-700"
      disabled={pending}
      size="sm"
      type="submit"
      variant="ghost"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Deleting" : "Delete Rule"}
    </Button>
  );
}

function RuleStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-muted-foreground"
      )}
    >
      {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function getRuleScopeLabel(
  rule: RealEstateTransactionRule,
  propertiesById: Map<string, RealEstateAsset>
): string {
  if (!rule.assetId) {
    return "All Properties";
  }

  return propertiesById.get(rule.assetId)?.name ?? "Property unavailable";
}

export function TransactionRulesPage({
  properties,
  rules
}: TransactionRulesPageProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    createRealEstateTransactionRule,
    initialActionState
  );
  const propertiesById = new Map(properties.map((property) => [property.id, property]));

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  function handleDeleteSubmit(
    event: FormEvent<HTMLFormElement>,
    rule: RealEstateTransactionRule
  ) {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) {
      event.preventDefault();
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Real Estate
        </p>
        <div className="mt-2">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Transaction rules
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Rules apply to matching debit transactions during sync and monthly review.
          </p>
        </div>
      </section>

      <RealEstatePortfolioNav active="rules" />

      <section className="grid gap-5 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)]">
        <Card className="h-fit border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Create Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Rule Name
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
                  name="name"
                  placeholder="Sunstrong utilities"
                  required
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid content-start gap-4 rounded-md border border-slate-200 bg-slate-50/60 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Before</h3>
                  <label className="grid gap-2 text-sm font-semibold">
                    Transaction Name Contains
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
                      name="containsText"
                      placeholder="SUNSTRONG"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Target Amount
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
                      min="0.01"
                      name="targetAmount"
                      placeholder="82.88"
                      required
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Scope
                    <select
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
                      defaultValue="all"
                      name="assetId"
                    >
                      <option value="all">All Properties</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid content-start gap-4 rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">After</h3>
                  <label className="grid gap-2 text-sm font-semibold">
                    Transaction Name
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
                      name="setTransactionName"
                      placeholder="Sunstrong Utilities"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Category
                    <select
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
                      defaultValue="utilities"
                      name="category"
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {expenseCategoryLabels[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CreateRuleButton />
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
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Rules</CardTitle>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <div className="flex min-h-[6rem] items-center rounded-md border border-slate-200 bg-secondary px-4 text-sm font-semibold text-muted-foreground">
                No transaction rules yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[54rem] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Before</th>
                      <th className="px-4 py-3">After</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr className="border-t border-slate-100" key={rule.id}>
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-slate-900">{rule.name}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="break-words font-semibold text-slate-900">
                            Name contains {rule.containsText}
                          </p>
                          <p className="mt-1 font-medium tabular-nums text-muted-foreground">
                            Amount {formatCurrency(rule.targetAmount)}
                          </p>
                          <p className="mt-1 font-medium text-muted-foreground">
                            {getRuleScopeLabel(rule, propertiesById)}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="break-words font-semibold text-slate-900">
                            {rule.setTransactionName || "Keep original name"}
                          </p>
                          <p className="mt-1 font-medium text-muted-foreground">
                            Category {expenseCategoryLabels[rule.category]}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <RuleStatusBadge isActive={rule.isActive} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            {rule.isActive ? (
                              <form action={deactivateRealEstateTransactionRule}>
                                <input name="ruleId" type="hidden" value={rule.id} />
                                <DeactivateRuleButton />
                              </form>
                            ) : (
                              <form action={reactivateRealEstateTransactionRule}>
                                <input name="ruleId" type="hidden" value={rule.id} />
                                <ReactivateRuleButton />
                              </form>
                            )}
                            <form
                              action={deleteRealEstateTransactionRule}
                              onSubmit={(event) => handleDeleteSubmit(event, rule)}
                            >
                              <input name="ruleId" type="hidden" value={rule.id} />
                              <DeleteRuleButton />
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
