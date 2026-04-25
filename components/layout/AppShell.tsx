"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true
  },
  {
    href: "/real-estate",
    label: "Real Estate",
    icon: Building2,
    exact: false
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(localStorage.getItem("wealthvibe-sidebar-collapsed") === "true");
  }, []);

  function toggleSidebar() {
    setIsCollapsed((current) => {
      const next = !current;
      localStorage.setItem("wealthvibe-sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-6 px-5 py-5 md:flex-row md:px-6 lg:px-8">
        <aside
          className={cn(
            "md:sticky md:top-5 md:h-[calc(100vh-2.5rem)] md:shrink-0",
            isCollapsed ? "md:w-20" : "md:w-60"
          )}
        >
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <Link
                aria-label="WealthVibe overview"
                className={cn("block min-w-0", isCollapsed && "hidden md:block")}
                href="/"
              >
                {isCollapsed ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    W
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                      WealthVibe
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-tight">
                      Household portfolio
                    </p>
                  </>
                )}
              </Link>
              <button
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="hidden rounded-md border border-slate-200 p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground md:inline-flex"
                onClick={toggleSidebar}
                type="button"
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>
            </div>

            <nav className="mt-6 grid gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

                return (
                  <Link
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                      isCollapsed && "md:justify-center md:px-2",
                      isActive && "bg-secondary text-foreground"
                    )}
                    href={item.href}
                    key={item.href}
                    title={item.label}
                  >
                    <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                    <span className={cn(isCollapsed && "md:hidden")}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
