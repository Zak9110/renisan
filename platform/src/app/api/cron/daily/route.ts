import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runDailyJobs } from "@/lib/jobs/daily";
import { getDb } from "@/lib/db-singleton";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  // Constant-time compare so the secret can't be recovered through response timing
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyJobs(await getDb());
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// Vercel Cron invokes GET; manual / external orchestrators (Inngest, GitHub Actions) invoke POST.
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
