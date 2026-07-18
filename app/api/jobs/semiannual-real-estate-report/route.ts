import type { NextRequest } from "next/server";

import {
  normalizeSemiannualReportPeriod,
  runSemiannualRealEstateReport
} from "@/lib/real-estate-semiannual-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDryRun(request: NextRequest): boolean {
  const value = request.nextUrl.searchParams.get("dryRun");

  return value === "1" || value === "true";
}

function getOptionalQueryParam(
  request: NextRequest,
  name: string
): string | undefined {
  const value = request.nextUrl.searchParams.get(name)?.trim();

  return value || undefined;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const year = getOptionalQueryParam(request, "year");
  const throughMonth = getOptionalQueryParam(request, "throughMonth");

  try {
    normalizeSemiannualReportPeriod({ throughMonth, year });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid report period.",
        ok: false
      },
      { status: 400 }
    );
  }

  const result = await runSemiannualRealEstateReport({
    dryRun: isDryRun(request),
    throughMonth,
    year
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
