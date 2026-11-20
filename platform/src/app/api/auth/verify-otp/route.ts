import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDeps, setSessionCookie } from "@/lib/auth/session";
import { verifyOtp } from "@/lib/auth/service";

const schema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(255),
  code: z.string().regex(/^\d{6}$/),
  locale: z.enum(["ar", "ckb", "kmr", "en"]).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const deps = await getAuthDeps();
  const result = await verifyOtp(deps, parsed.data);

  if (!result.ok) {
    const status = result.error === "too_many_attempts" ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await setSessionCookie(result.sessionToken, result.expiresAt);
  return NextResponse.json({ ok: true, userId: result.userId, isNewUser: result.isNewUser });
}
