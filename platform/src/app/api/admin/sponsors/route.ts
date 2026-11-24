import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { httpUrl } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { isEditorOrAdmin } from "@/lib/admin/service";
import { adminCreatePlacement, adminCreateSponsor, adminListSponsors } from "@/lib/sponsors/service";

const postSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sponsor"),
    name: z.string().min(2).max(160),
    websiteUrl: httpUrl,
  }),
  z.object({
    kind: z.literal("placement"),
    sponsorId: z.uuid(),
    slot: z.enum(["opportunities_banner", "admissions_banner", "home_card"]).default("opportunities_banner"),
    title: z.object({
      ar: z.string().max(200).optional(),
      ckb: z.string().max(200).optional(),
      kmr: z.string().max(200).optional(),
      en: z.string().max(200).optional(),
    }),
    summary: z
      .object({
        ar: z.string().max(400).optional(),
        ckb: z.string().max(400).optional(),
        kmr: z.string().max(400).optional(),
        en: z.string().max(400).optional(),
      })
      .optional()
      .nullable(),
    targetUrl: httpUrl,
    startsAt: z.string(),
    endsAt: z.string(),
  }),
]);

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const data = await adminListSponsors(db, user.role);
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
  if (parsed.data.kind === "sponsor") {
    const res = await adminCreateSponsor(db, user.id, user.role, parsed.data);
    return NextResponse.json(res, { status: res.ok ? 201 : 400 });
  }
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }
  const res = await adminCreatePlacement(db, user.id, user.role, {
    ...parsed.data,
    startsAt,
    endsAt,
  });
  return NextResponse.json(res, { status: res.ok ? 201 : 400 });
}
