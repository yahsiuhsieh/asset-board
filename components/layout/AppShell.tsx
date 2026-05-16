"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  Sun
} from "lucide-react";
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

type Theme = "light" | "dark";

const themeStorageKey = "wealthvibe-theme";

function getSystemTheme(): Theme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedTheme = localStorage.getItem(themeStorageKey);

  return storedTheme === "light" || storedTheme === "dark" ? storedTheme : null;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme;
}

function ThemeToggle({
  isExpanded = false,
  theme,
  onToggle
}: {
  isExpanded?: boolean;
  theme: Theme;
  onToggle: () => void;
}) {
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isExpanded ? "w-full gap-3 px-3 text-sm font-semibold" : "w-10"
      )}
      onClick={onToggle}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
      {isExpanded ? <span>{isDark ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setIsSidebarOpen(localStorage.getItem("wealthvibe-sidebar-open") === "true");

    const initialTheme = getStoredTheme() ?? getSystemTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (getStoredTheme()) {
        return;
      }

      const nextTheme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  function setSidebarOpen(isOpen: boolean) {
    setIsSidebarOpen(isOpen);
    localStorage.setItem("wealthvibe-sidebar-open", String(isOpen));
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    applyTheme(nextTheme);
    localStorage.setItem(themeStorageKey, nextTheme);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-y-0 left-0 z-30 flex w-14 flex-col items-center justify-between border-r border-border bg-card py-4 print:hidden">
        <div className="grid justify-items-center">
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

        <ThemeToggle onToggle={toggleTheme} theme={theme} />
      </div>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[86vw] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
          "print:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-secondary hover:text-foreground"
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

        <div className="border-t border-border p-3">
          <ThemeToggle isExpanded onToggle={toggleTheme} theme={theme} />
        </div>
      </aside>

      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 cursor-default bg-slate-950/30 backdrop-blur-[1px] print:hidden dark:bg-slate-950/55"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <div className="mx-auto w-full max-w-[92rem] py-5 pl-[4.75rem] pr-5 print:max-w-none print:p-0 md:pl-20 md:pr-6 lg:pr-8">
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
