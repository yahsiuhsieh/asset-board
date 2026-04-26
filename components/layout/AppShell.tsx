"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Menu, PanelLeftClose } from "lucide-react";
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(localStorage.getItem("wealthvibe-sidebar-open") === "true");
  }, []);

  function setSidebarOpen(isOpen: boolean) {
    setIsSidebarOpen(isOpen);
    localStorage.setItem("wealthvibe-sidebar-open", String(isOpen));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-y-0 left-0 z-30 flex w-14 flex-col items-center border-r border-slate-200 bg-white py-4">
        <button
          aria-label="Open sidebar"
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground",
            isSidebarOpen && "pointer-events-none opacity-0"
          )}
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav className="mt-5 grid gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                aria-label={item.label}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                  isActive && "bg-secondary text-primary"
                )}
                href={item.href}
                key={item.href}
                title={item.label}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>
      </div>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[86vw] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
          <Link
            aria-label="WealthVibe overview"
            className="block min-w-0"
            href="/"
            onClick={() => setSidebarOpen(false)}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              WealthVibe
            </p>
            <p className="mt-1 text-base font-semibold tracking-tight">
              Household portfolio
            </p>
          </Link>
          <button
            aria-label="Close sidebar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4">
          <div className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                    isActive && "bg-secondary text-foreground"
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

      </aside>

      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 cursor-default bg-slate-950/10 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <div className="mx-auto w-full max-w-[92rem] py-5 pl-[4.75rem] pr-5 md:pl-20 md:pr-6 lg:pr-8">
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
