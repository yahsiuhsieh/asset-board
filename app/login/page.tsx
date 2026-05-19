import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { loginToAssetBoard } from "@/app/login/actions";
import {
  getSafeSiteAuthRedirectPath,
  isSitePasswordConfigured,
  SITE_AUTH_COOKIE_NAME,
  verifySiteAuthCookie
} from "@/lib/site-auth";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams?: Promise<{
    config?: string | string[];
    error?: string | string[];
    next?: string | string[];
  }>;
}

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = getSafeSiteAuthRedirectPath(
    getSearchParamValue(resolvedSearchParams?.next)
  );
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SITE_AUTH_COOKIE_NAME)?.value;

  if (await verifySiteAuthCookie(cookieValue)) {
    redirect(nextPath);
  }

  const hasError = getSearchParamValue(resolvedSearchParams?.error) === "1";
  const isMissingConfig =
    getSearchParamValue(resolvedSearchParams?.config) === "missing" ||
    !isSitePasswordConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              AssetBoard
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Enter password</h1>
          </div>
        </div>

        <form action={loginToAssetBoard} className="grid gap-4">
          <input name="next" type="hidden" value={nextPath} />
          <label className="grid gap-2 text-sm font-semibold">
            Password
            <input
              autoComplete="current-password"
              autoFocus
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
              name="password"
              required
              type="password"
            />
          </label>

          {isMissingConfig ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300">
              Site password is not configured.
            </p>
          ) : null}

          {hasError && !isMissingConfig ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-300">
              Password is incorrect.
            </p>
          ) : null}

          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            disabled={isMissingConfig}
            type="submit"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
