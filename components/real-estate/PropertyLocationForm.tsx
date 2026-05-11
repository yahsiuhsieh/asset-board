"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MapPin } from "lucide-react";

import {
  type RealEstateActionState,
  updatePropertyLocation
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAsset } from "@/types/wealth";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <MapPin className="h-4 w-4" />
      {pending ? "Saving" : "Save Location"}
    </Button>
  );
}

export function PropertyLocationForm({ property }: { property: RealEstateAsset }) {
  const [state, formAction] = useActionState(
    updatePropertyLocation.bind(null, property.id),
    initialState
  );

  return (
    <form action={formAction} className="mt-4 grid gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold">
          Latitude
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
            defaultValue={property.latitude ?? ""}
            inputMode="decimal"
            name="latitude"
            placeholder="37.7749"
            type="text"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Longitude
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
            defaultValue={property.longitude ?? ""}
            inputMode="decimal"
            name="longitude"
            placeholder="-122.4194"
            type="text"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Map zoom
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
            defaultValue={property.mapZoom}
            max="20"
            min="1"
            name="mapZoom"
            placeholder="12"
            step="1"
            type="number"
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton />
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
    </form>
  );
}
