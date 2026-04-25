"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import {
  addMetricSnapshot,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { snapshotMetricOptions } from "@/lib/real-estate-history";
import { cn } from "@/lib/utils";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <Plus className="h-4 w-4" />
      {pending ? "Saving" : "Add Snapshot"}
    </Button>
  );
}

export function SnapshotForm({ assetId }: { assetId: string }) {
  const [state, formAction] = useActionState(
    addMetricSnapshot.bind(null, assetId),
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_1fr]">
        <label className="grid gap-2 text-sm font-semibold">
          Metric
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
            name="metricType"
          >
            {snapshotMetricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Date
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring"
            defaultValue={new Date().toISOString().slice(0, 10)}
            name="recordedAt"
            required
            type="date"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Value
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
            inputMode="decimal"
            min="0"
            name="value"
            placeholder="0"
            required
            step="0.01"
            type="number"
          />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
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
  );
}
