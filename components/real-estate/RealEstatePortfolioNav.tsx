import Link from "next/link";
import { Building2, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/real-estate",
    label: "Portfolio",
    value: "portfolio",
    icon: Building2
  },
  {
    href: "/real-estate/rules",
    label: "Rules",
    value: "rules",
    icon: ListChecks
  }
] as const;

export function RealEstatePortfolioNav({
  active
}: {
  active: (typeof navItems)[number]["value"];
}) {
  return (
    <nav
      aria-label="Real estate portfolio views"
      className="flex w-fit max-w-full overflow-hidden rounded-md border border-border bg-card p-1 shadow-sm"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.value === active;

        return (
          <Link
            className={cn(
              "inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground",
              isActive && "bg-secondary text-primary"
            )}
            href={item.href}
            key={item.value}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
