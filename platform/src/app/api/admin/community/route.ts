import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { httpUrl } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { isEditorOrAdmin } from "@/lib/admin/service";
import {
  adminCreateClub,
  adminCreateEvent,
  listAdminCommunityQueues,
  moderateQuestion,
  verifyAmbassador,
} from "@/lib/community/service";

const i18nSchema = z.object({
  ar: z.string().max(400).optional(),
  ckb: z.string().max(400).optional(),
  kmr: z.string().max(400).optional(),
  en: z.string().max(400).optional(),
});

const postSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("verify_ambassador"), ambassadorId: z.uuid(), approve: z.boolean() }),
  z.object({
    kind: z.literal("moderate_question"),
    questionId: z.uuid(),
    decision: z.enum(["approved", "hidden"]),
  }),
  z.object({
    kind: z.literal("create_event"),
    title: i18nSchema,
    description: i18nSchema.optional().nullable(),
    hostName: z.string().min(2).max(160),
    startsAt: z.string(),
    externalUrl: httpUrl,
    replayUrl: httpUrl.optional().nullable(),
  }),
  z.object({
    kind: z.literal("create_club"),
    name: i18nSchema,
    description: i18nSchema.optional().nullable(),
    topic: z.string().min(2).max(80),
    externalUrl: httpUrl,
    codeOfConductUrl: httpUrl.optional().nullable(),
  }),
]);

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const data = await listAdminCommunityQueues(db, user.role);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  if (parsed.data.kind === "verify_ambassador") {
    const res = await verifyAmbassador(db, user.id, user.role, parsed.data.ambassadorId, parsed.data.approve);
    return NextResponse.json(res, { status: res.ok ? 200 : 404 });
  }
  if (parsed.data.kind === "moderate_question") {
    const res = await moderateQuestion(db, user.id, user.role, parsed.data.questionId, parsed.data.decision);
    return NextResponse.json(res, { status: res.ok ? 200 : 404 });
  }
  if (parsed.data.kind === "create_event") {
    const startsAt = new Date(parsed.data.startsAt);
    if (Number.isNaN(startsAt.getTime()))
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    const res = await adminCreateEvent(db, user.id, user.role, { ...parsed.data, startsAt });
    return NextResponse.json(res, { status: res.ok ? 201 : 400 });
  }
  const res = await adminCreateClub(db, user.id, user.role, parsed.data);
  return NextResponse.json(res, { status: res.ok ? 201 : 400 });
}
