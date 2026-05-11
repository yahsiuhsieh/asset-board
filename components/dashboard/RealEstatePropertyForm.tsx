"use client";

import { useActionState, useEffect, useId } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
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
  { name: "monthlyMortgage", label: "Monthly mortgage" },
  { name: "monthlyRent", label: "Monthly rent" },
  { name: "buildingCost", label: "Cost of building" },
  { name: "landCost", label: "Cost of land" },
  { name: "totalDepreciation", label: "Total depreciation" }
] as const;

const metadataFields = [
  { name: "county", label: "County", placeholder: "Riverside County", type: "text" },
  { name: "purchasedAt", label: "Purchase date", placeholder: "", type: "date" },
  { name: "parcelNumber", label: "Parcel number", placeholder: "APN / parcel number", type: "text" }
] as const;

const rentalStatusOptions = [
  { value: "rented", label: "Rented" },
  { value: "vacant", label: "Vacant" }
] as const;

function SubmitButton({
  formId,
  isPending,
  mode
}: Pick<RealEstatePropertyFormProps, "mode"> & {
  formId: string;
  isPending: boolean;
}) {
  return (
    <Button disabled={isPending} form={formId} type="submit">
      <Save className="h-4 w-4" />
      {isPending ? "Saving" : mode === "create" ? "Add Property" : "Save Changes"}
    </Button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" disabled={pending} className="text-red-600 dark:text-red-400">
      <Trash2 className="h-4 w-4" />
      {pending ? "Deleting" : "Delete Property"}
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
    monthlyMortgage: property.monthlyMortgage,
    monthlyRent: property.monthlyRent,
    rentalStatus: property.rentalStatus,
    county: property.county ?? "",
    purchasedAt: property.purchasedAt ?? "",
    parcelNumber: property.parcelNumber ?? "",
    buildingCost: property.buildingCost,
    landCost: property.landCost,
    totalDepreciation: property.totalDepreciation
  };

  return values[field] ?? "";
}

export function RealEstatePropertyForm({ mode, property }: RealEstatePropertyFormProps) {
  const router = useRouter();
  const formId = useId();
  const action =
    mode === "create"
      ? createRealEstateProperty
      : updateRealEstateProperty.bind(null, property?.id ?? "");
  const [state, formAction, isPending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-4" id={formId}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Property name
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={property?.name ?? ""}
              name="name"
              placeholder="Maple Row Duplex"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Address
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={property?.address ?? ""}
              name="address"
              placeholder="14693 Gulfstream Ln, Moreno Valley, CA 92553"
              required
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="grid gap-2 text-sm font-semibold">
            Rental status
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
              defaultValue={getDefaultValue(property, "rentalStatus") || "rented"}
              name="rentalStatus"
            >
              {rentalStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {metadataFields.map((field) => (
            <label className="grid gap-2 text-sm font-semibold" key={field.name}>
              {field.label}
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
                defaultValue={getDefaultValue(property, field.name)}
                name={field.name}
                placeholder={field.placeholder}
                type={field.type}
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {moneyFields.map((field) => (
            <label className="grid gap-2 text-sm font-semibold" key={field.name}>
              {field.label}
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
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
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton formId={formId} isPending={isPending} mode={mode} />
          {mode === "edit" && property ? (
            <form action={deleteRealEstateProperty}>
              <input name="assetId" type="hidden" value={property.id} />
              <DeleteButton />
            </form>
          ) : null}
        </div>
        {state.message ? (
          <p
            className={cn(
              "text-sm font-semibold",
              state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
