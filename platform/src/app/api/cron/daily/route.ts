import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db-singleton";
import { runDailyIngestion } from "@/lib/ingestion/daily";
import { pruneRateLimits } from "@/lib/auth/rate-limit";

function authorized(req: NextRequest): boolean {
  const expected = env().CRON_SECRET;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const summary = await runDailyIngestion(db);
  await pruneRateLimits(db, 24 * 60 * 60 * 1000);
  return NextResponse.json({ ok: true, summary });
}

// Vercel Cron invokes GET; manual / external orchestrators (Inngest, GitHub Actions) invoke POST.
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
