import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runAlerts } from "@/lib/jobs/daily";
import { getDb } from "@/lib/db-singleton";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const includeDigests = url.searchParams.get("digests") !== "0";
  const forceWeeklyDigest = url.searchParams.get("weekly") === "1";

  const alerts = await runAlerts(await getDb(), { includeDigests, forceWeeklyDigest });

  return NextResponse.json({ ok: true, alerts });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
