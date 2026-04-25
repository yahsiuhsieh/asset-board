"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Upload } from "lucide-react";

import {
  uploadPropertyPhoto,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <Upload className="h-4 w-4" />
      {pending ? "Uploading" : "Upload Photo"}
    </Button>
  );
}

export function PhotoUploadForm({ assetId }: { assetId: string }) {
  const [state, formAction] = useActionState(
    uploadPropertyPhoto.bind(null, assetId),
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="grid gap-2 text-sm font-semibold">
          Photo
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
            name="photo"
            required
            type="file"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Caption
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
            name="caption"
            placeholder="Front exterior"
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
