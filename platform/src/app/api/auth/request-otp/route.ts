import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthDeps } from "@/lib/auth/session";
import { requestOtp } from "@/lib/auth/service";

const schema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(255),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const deps = await getAuthDeps();
  const result = await requestOtp(deps, {
    channel: parsed.data.channel,
    target: parsed.data.target,
    ip,
  });

  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : result.error === "invalid_target" ? 400 : 502;
    return NextResponse.json({ error: result.error, retryAfterSec: result.retryAfterSec }, { status });
  }

  // Only expose devCode when running locally with console providers
  const allowDevCode = process.env.APP_ENV !== "production" && result.devCode;
  return NextResponse.json({
    ok: true,
    expiresAt: result.expiresAt.toISOString(),
    ...(allowDevCode ? { devCode: result.devCode } : {}),
  });
}
