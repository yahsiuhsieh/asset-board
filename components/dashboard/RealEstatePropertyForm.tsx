"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, Trash2 } from "lucide-react";

import {
  createRealEstateProperty,
  deleteRealEstateProperty,
  type RealEstateActionState,
  updateRealEstateProperty
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAsset } from "@/types/wealth";

interface RealEstatePropertyFormProps {
  mode: "create" | "edit";
  property?: RealEstateAsset;
}

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

const moneyFields = [
  { name: "purchasePrice", label: "Purchase price" },
  { name: "remainingMortgageBalance", label: "Mortgage balance" },
  { name: "monthlyRent", label: "Monthly rent" },
  { name: "monthlyMortgage", label: "Monthly mortgage" }
] as const;

function SubmitButton({ mode }: Pick<RealEstatePropertyFormProps, "mode">) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      <Save className="h-4 w-4" />
      {pending ? "Saving" : mode === "create" ? "Add Property" : "Save Changes"}
    </Button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" disabled={pending} className="text-red-600">
      <Trash2 className="h-4 w-4" />
      {pending ? "Deleting" : "Delete"}
    </Button>
  );
}

function getDefaultValue(property: RealEstateAsset | undefined, field: string): string | number {
  if (!property) {
    return "";
  }

  const values: Record<string, string | number> = {
    purchasePrice: property.purchasePrice,
    remainingMortgageBalance: property.remainingMortgageBalance,
    monthlyRent: property.monthlyRent,
    monthlyMortgage: property.monthlyMortgage,
    annualExpenses: property.annualExpenses,
    annualTaxes: property.annualTaxes,
    annualInsurance: property.annualInsurance,
    annualMaintenance: property.annualMaintenance
  };

  return values[field] ?? "";
}

export function RealEstatePropertyForm({ mode, property }: RealEstatePropertyFormProps) {
  const action =
    mode === "create"
      ? createRealEstateProperty
      : updateRealEstateProperty.bind(null, property?.id ?? "");
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-4">
        <input name="annualExpenses" type="hidden" value={property?.annualExpenses ?? 0} />
        <input name="annualTaxes" type="hidden" value={property?.annualTaxes ?? 0} />
        <input name="annualInsurance" type="hidden" value={property?.annualInsurance ?? 0} />
        <input
          name="annualMaintenance"
          type="hidden"
          value={property?.annualMaintenance ?? 0}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Property name
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={property?.name ?? ""}
              name="name"
              placeholder="Maple Row Duplex"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Address
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={property?.address ?? ""}
              name="address"
              placeholder="1420 Maple Row"
              required
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {moneyFields.map((field) => (
            <label className="grid gap-2 text-sm font-semibold" key={field.name}>
              {field.label}
              <input
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
                defaultValue={getDefaultValue(property, field.name)}
                inputMode="decimal"
                min="0"
                name={field.name}
                placeholder="0"
                step="0.01"
                type="number"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SubmitButton mode={mode} />
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

      {mode === "edit" && property ? (
        <form action={deleteRealEstateProperty} className="flex justify-end">
          <input name="assetId" type="hidden" value={property.id} />
          <DeleteButton />
        </form>
      ) : null}
    </div>
  );
}
