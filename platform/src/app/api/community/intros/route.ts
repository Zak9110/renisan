import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { listMyCommunity, requestAmbassadorIntro, respondAmbassadorIntro } from "@/lib/community/service";

const postSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("request"),
    ambassadorId: z.uuid(),
    note: z.string().min(5).max(600),
  }),
  z.object({
    kind: z.literal("respond"),
    introId: z.uuid(),
    decision: z.enum(["accepted", "declined"]),
    contactChannel: z.string().max(120).optional(),
  }),
]);

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = await getDb();
  return NextResponse.json(await listMyCommunity(db, user.id));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const limited = await rateLimited(db, "community-intro", user.id, 20);
  if (limited) return limited;
  if (parsed.data.kind === "request") {
    const res = await requestAmbassadorIntro(db, user.id, parsed.data.ambassadorId, parsed.data.note);
    return NextResponse.json(res, {
      status: res.ok ? 201 : res.error === "minors_cannot_request_intros" ? 403 : 400,
    });
  }
  const res = await respondAmbassadorIntro(
    db,
    user.id,
    parsed.data.introId,
    parsed.data.decision,
    parsed.data.contactChannel,
  );
  return NextResponse.json(res, { status: res.ok ? 200 : 403 });
}
