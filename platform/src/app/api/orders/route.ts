import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { createServiceOrder, listUserOrders } from "@/lib/helpers/service";

const createOrderSchema = z.object({
  serviceId: z.uuid(),
  guardianConsent: z
    .object({
      guardianName: z.string().min(2).max(120),
      guardianContact: z.string().min(4).max(120),
      consentText: z.string().min(10).max(1000),
      locale: z.enum(["ar", "ckb", "kmr", "en"]).default("ar"),
    })
    .optional(),
});

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = await getDb();
  const data = await listUserOrders(db, user.id);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const cfg = env();
  const db = await getDb();
  const limited = await rateLimited(db, "order-create", user.id, 10);
  if (limited) return limited;
  const res = await createServiceOrder(db, user.id, cfg.SESSION_SECRET, cfg.PAYMENT_PROVIDER, parsed.data);
  if (!res.ok) {
    const status =
      res.error === "guardian_consent_required" || res.error === "service_not_allowed_for_minors" ? 403 : 400;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res, { status: 201 });
}
