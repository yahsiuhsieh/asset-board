import { NextResponse, type NextRequest } from "next/server";

import {
  getSafeSiteAuthRedirectPath,
  isSitePasswordConfigured,
  SITE_AUTH_COOKIE_NAME,
  verifySiteAuthCookie
} from "@/lib/site-auth";

const PUBLIC_PATH_PREFIXES = ["/_next/", "/_vercel/"];
const PUBLIC_PATHS = new Set([
  "/api/jobs/monthly-real-estate-review",
  "/api/jobs/semiannual-real-estate-report",
  "/favicon.ico",
  "/icon.png"
]);
const PUBLIC_FILE_PATTERN = /\.(?:css|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webp|xml)$/i;

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

function createLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone();
  const nextPath = getSafeSiteAuthRedirectPath(
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", nextPath);

  if (!isSitePasswordConfigured()) {
    loginUrl.searchParams.set("config", "missing");
  }

  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(SITE_AUTH_COOKIE_NAME)?.value;

  if (await verifySiteAuthCookie(cookieValue)) {
    return NextResponse.next();
  }

  return createLoginRedirect(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"]
};
