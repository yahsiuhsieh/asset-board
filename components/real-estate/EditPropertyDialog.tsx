"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";

import { RealEstatePropertyForm } from "@/components/dashboard/RealEstatePropertyForm";
import { Button } from "@/components/ui/button";
import type { RealEstateAsset } from "@/types/wealth";

export function EditPropertyDialog({ property }: { property: RealEstateAsset }) {
  const [isOpen, setIsOpen] = useState(false);

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
        aria-label="Edit property"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-primary"
        onClick={() => setIsOpen(true)}
        size="sm"
        title="Edit property"
        type="button"
        variant="ghost"
      >
        <Pencil className="h-4 w-4" />
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
                <h2 className="text-lg font-semibold tracking-tight">Edit Property</h2>
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
              <RealEstatePropertyForm mode="edit" property={property} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
