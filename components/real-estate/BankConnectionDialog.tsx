"use client";

import { useEffect, useState } from "react";
import { Landmark, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RealEstateAssetDetail } from "@/types/wealth";
import { PlaidConnectionManager } from "./PlaidConnectionManager";

export function BankConnectionDialog({
  property
}: {
  property: RealEstateAssetDetail;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const connectedAccountCount = property.bankConnections.length;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <Button
        aria-label="Bank connections"
        className="relative h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-primary"
        onClick={() => setIsOpen(true)}
        size="sm"
        title="Bank connections"
        type="button"
        variant="ghost"
      >
        <Landmark className="h-4 w-4" />
        {connectedAccountCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {connectedAccountCount}
          </span>
        ) : null}
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-soft">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Bank Connections</h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {property.name}
                </p>
              </div>
              <Button
                aria-label="Close"
                className="h-8 w-8 p-0"
                onClick={() => setIsOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5">
              <PlaidConnectionManager property={property} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
