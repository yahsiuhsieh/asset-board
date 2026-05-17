"use client";

import { useActionState, useRef, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import {
  uploadPropertyPhoto,
  type RealEstateActionState
} from "@/app/actions/real-estate";

const initialState: RealEstateActionState = {
  status: "idle",
  message: ""
};

export function CoverPhotoUploadButton({
  assetId,
  hasCoverPhoto
}: {
  assetId: string;
  hasCoverPhoto: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    uploadPropertyPhoto.bind(null, assetId),
    initialState
  );
  const buttonLabel = hasCoverPhoto ? "Replace Photo" : "Upload Photo";
  const accessibleLabel = hasCoverPhoto ? "Replace cover photo" : "Upload cover photo";

  function handleButtonClick() {
    if (pending) {
      return;
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    inputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files?.length) {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form action={formAction} className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4" ref={formRef}>
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={pending}
        name="photo"
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
      <button
        aria-label={accessibleLabel}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card/95 px-3 text-sm font-semibold text-foreground shadow-soft backdrop-blur transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
        disabled={pending}
        onClick={handleButtonClick}
        title={accessibleLabel}
        type="button"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{pending ? "Uploading" : buttonLabel}</span>
      </button>
      {state.status === "error" && state.message ? (
        <p className="absolute right-0 top-full mt-2 w-64 rounded-md border border-red-200 bg-card px-3 py-2 text-xs font-semibold text-red-600 shadow-soft dark:border-red-900/70 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
