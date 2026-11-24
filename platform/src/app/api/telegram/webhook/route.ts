import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db-singleton";
import { createTelegramSender } from "@/lib/telegram/client";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram/service";

function validWebhookSecret(req: NextRequest, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const provided = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(expectedSecret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest) {
  const cfg = env();
  if (!validWebhookSecret(req, cfg.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = await getDb();
  const result = await handleTelegramUpdate(
    {
      db,
      secret: cfg.SESSION_SECRET,
      encryptionKey: cfg.TELEGRAM_CHATID_ENCRYPTION_KEY ?? cfg.SESSION_SECRET,
      appUrl: cfg.APP_URL,
      sender: createTelegramSender(cfg.TELEGRAM_BOT_TOKEN),
    },
    update,
  );

  return NextResponse.json({ ok: true, handled: result.handled, command: result.command ?? null });
}
