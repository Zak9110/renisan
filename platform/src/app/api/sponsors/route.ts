import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clientIpHash, rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { listActivePlacements, recordPlacementEvent } from "@/lib/sponsors/service";

const eventSchema = z.object({
  placementId: z.uuid(),
  kind: z.enum(["impression", "click"]),
});

export async function GET(req: NextRequest) {
  const slot = new URL(req.url).searchParams.get("slot") ?? undefined;
  const db = await getDb();
  const placements = await listActivePlacements(db, slot);
  return NextResponse.json({ placements });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  // One counted event per visitor, placement and kind per hour keeps aggregate stats honest.
  const who = `${parsed.data.kind}:${parsed.data.placementId.slice(0, 13)}:${clientIpHash(req).slice(0, 32)}`;
  if (await rateLimited(db, "sponsor", who, 1)) return NextResponse.json({ ok: true });
  const ok = await recordPlacementEvent(db, parsed.data.placementId, parsed.data.kind);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
