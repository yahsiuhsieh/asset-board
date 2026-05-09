"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const CLOSED_REVIEW_ACTION_MESSAGE =
  "Reopen this monthly review before changing transactions.";

export function ClosedReviewActionHint({
  children,
  className,
  disabled,
  message = CLOSED_REVIEW_ACTION_MESSAGE
}: {
  children: ReactNode;
  className?: string;
  disabled: boolean;
  message?: string;
}) {
  if (!disabled) {
    return <>{children}</>;
  }

  return (
    <span
      aria-label={message}
      className={cn("inline-flex w-fit cursor-not-allowed", className)}
      tabIndex={0}
      title={message}
    >
      {children}
    </span>
  );
}
