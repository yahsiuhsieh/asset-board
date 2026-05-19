"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSiteAuthCookieValue,
  getSafeSiteAuthRedirectPath,
  isSitePasswordConfigured,
  SITE_AUTH_COOKIE_MAX_AGE_SECONDS,
  SITE_AUTH_COOKIE_NAME,
  verifySitePassword
} from "@/lib/site-auth";

function getLoginRedirectPath({
  error,
  missingConfig,
  nextPath
}: {
  error?: boolean;
  missingConfig?: boolean;
  nextPath: string;
}): string {
  const params = new URLSearchParams({
    next: nextPath
  });

  if (error) {
    params.set("error", "1");
  }

  if (missingConfig) {
    params.set("config", "missing");
  }

  return `/login?${params.toString()}`;
}

export async function loginToAssetBoard(formData: FormData) {
  const nextPath = getSafeSiteAuthRedirectPath(String(formData.get("next") ?? "/"));
  const password = String(formData.get("password") ?? "");

  if (!isSitePasswordConfigured()) {
    redirect(getLoginRedirectPath({ missingConfig: true, nextPath }));
  }

  if (!(await verifySitePassword(password))) {
    redirect(getLoginRedirectPath({ error: true, nextPath }));
  }

  const cookieValue = await createSiteAuthCookieValue();

  if (!cookieValue) {
    redirect(getLoginRedirectPath({ missingConfig: true, nextPath }));
  }

  const cookieStore = await cookies();

  cookieStore.set(SITE_AUTH_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    maxAge: SITE_AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  redirect(nextPath);
}
