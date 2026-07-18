import type { NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("assets").select("id").limit(1);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, checkedAt: new Date().toISOString() });
}
