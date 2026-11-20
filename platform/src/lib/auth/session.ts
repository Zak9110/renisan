import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db-singleton";
import { createEmailProvider } from "@/lib/email/provider";
import { createSmsProvider } from "@/lib/sms/provider";
import { getSessionUser, type AuthDeps } from "./service";

export const SESSION_COOKIE = "renisan_session";

export async function getAuthDeps(): Promise<AuthDeps> {
  const cfg = env();
  const db = await getDb();
  return {
    db,
    secret: cfg.SESSION_SECRET,
    sms: createSmsProvider(cfg.SMS_PROVIDER, cfg.OTPIQ_API_KEY),
    email: createEmailProvider(),
  };
}

export async function getCurrentSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  return getSessionUser(db, token);
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
