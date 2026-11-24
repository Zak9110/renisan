import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { issueTelegramLinkCode, unlinkTelegramAccount } from "@/lib/telegram/service";

export async function POST() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = env();
  const db = await getDb();
  const limited = await rateLimited(db, "tg-link-code", user.id, 10);
  if (limited) return limited;
  const issued = await issueTelegramLinkCode(db, user.id, cfg.SESSION_SECRET, cfg.TELEGRAM_BOT_USERNAME);
  return NextResponse.json(issued);
}

export async function DELETE() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = await getDb();
  await unlinkTelegramAccount(db, user.id);
  return NextResponse.json({ ok: true });
}
