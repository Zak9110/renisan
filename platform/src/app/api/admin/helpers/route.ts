import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";
import { isEditorOrAdmin } from "@/lib/admin/service";
import {
  listAdminHelperQueues,
  reviewHelperService,
  transitionOrder,
  verifyHelper,
} from "@/lib/helpers/service";

const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("verify_helper"),
    helperUserId: z.uuid(),
    decision: z.enum(["approve", "reject", "ban"]),
  }),
  z.object({
    kind: z.literal("review_service"),
    serviceId: z.uuid(),
    decision: z.enum(["active", "rejected", "paused"]),
  }),
  z.object({
    kind: z.literal("transition_order"),
    orderId: z.uuid(),
    status: z.enum(["paid_held", "released", "refunded"]),
    reason: z.string().max(500).optional(),
  }),
]);

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const data = await listAdminHelperQueues(db, user.role);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEditorOrAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  if (parsed.data.kind === "verify_helper") {
    const res = await verifyHelper(db, user.id, user.role, parsed.data.helperUserId, parsed.data.decision);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  if (parsed.data.kind === "review_service") {
    const res = await reviewHelperService(
      db,
      user.id,
      user.role,
      parsed.data.serviceId,
      parsed.data.decision,
    );
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  const res = await transitionOrder(db, user.id, user.role, parsed.data.orderId, parsed.data.status, {
    reason: parsed.data.reason,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
