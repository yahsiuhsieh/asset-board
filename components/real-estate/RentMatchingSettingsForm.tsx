"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { SlidersHorizontal } from "lucide-react";

import {
  updateRentMatchingSettings,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAssetDetail } from "@/types/wealth";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="secondary">
      <SlidersHorizontal className="h-4 w-4" />
      {pending ? "Saving" : "Save Rules"}
    </Button>
  );
}

export function RentMatchingSettingsForm({
  property
}: {
  property: RealEstateAssetDetail;
}) {
  const [state, formAction] = useActionState(
    updateRentMatchingSettings.bind(null, property.id),
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4 border-t border-slate-100 pt-5">
      <div className="grid gap-4 md:grid-cols-[12rem_auto] md:items-end">
        <label className="grid gap-2 text-sm font-semibold">
          Tolerance
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
            defaultValue={property.rentMatchTolerance}
            inputMode="decimal"
            min="0"
            name="rentMatchTolerance"
            placeholder="50"
            required
            step="0.01"
            type="number"
          />
        </label>
        <SubmitButton />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        Credits within target rent plus or minus this tolerance can be recorded as
        rental income. Partial payments are not auto-matched.
      </p>
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
  );
}
