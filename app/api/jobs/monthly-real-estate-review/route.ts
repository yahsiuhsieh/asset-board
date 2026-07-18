import type { NextRequest } from "next/server";

import {
  normalizeAutoReviewMonth,
  runMonthlyRealEstateAutoReview
} from "@/lib/real-estate-monthly-auto-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDryRun(request: NextRequest): boolean {
  const value = request.nextUrl.searchParams.get("dryRun");

  return value === "1" || value === "true";
}

function getRequestedReviewMonth(request: NextRequest): string | undefined {
  const value = request.nextUrl.searchParams.get("reviewMonth")?.trim();

  if (!value) {
    return undefined;
  }

  return normalizeAutoReviewMonth(value);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let reviewMonth: string | undefined;

  try {
    reviewMonth = getRequestedReviewMonth(request);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid reviewMonth.",
        ok: false
      },
      { status: 400 }
    );
  }

  const result = await runMonthlyRealEstateAutoReview({
    dryRun: isDryRun(request),
    reviewMonth
  });
  const status = result.notification.status === "failed" ? 502 : 200;

  return Response.json(
    {
      ok: status === 200,
      result
    },
    { status }
  );
}
