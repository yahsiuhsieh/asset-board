import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DetailRow {
  label: string;
  value: string;
  emphasis?: "positive" | "negative" | "neutral";
}

interface AssetCardProps {
  title: string;
  icon: LucideIcon;
  primaryValue: string;
  mode?: "summary" | "detail";
  description?: string;
  rows?: DetailRow[];
  className?: string;
}

export function AssetCard({
  title,
  icon: Icon,
  primaryValue,
  mode = "summary",
  description,
  rows = [],
  className
}: AssetCardProps) {
  const isDetail = mode === "detail";

  return (
    <Card
      className={cn(
        "overflow-hidden border-white/70 bg-white/70",
        isDetail ? "min-h-[25rem]" : "min-h-[12rem]",
        className
      )}
    >
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="rounded-2xl bg-secondary p-3 text-foreground">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("font-semibold tracking-tight", isDetail ? "text-4xl" : "text-3xl")}>
          {primaryValue}
        </p>

        {isDetail ? (
          <div className="mt-8 overflow-hidden rounded-3xl border bg-white/60">
            <div className="grid grid-cols-1 divide-y">
              {rows.map((row) => (
                <div
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  key={row.label}
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      row.emphasis === "positive" && "text-emerald-700",
                      row.emphasis === "negative" && "text-red-700"
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
