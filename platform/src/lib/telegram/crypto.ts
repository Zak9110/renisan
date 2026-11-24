import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function deriveAesKey(rawKey: string): Buffer {
  return createHash("sha256").update(rawKey).digest();
}

/** Encrypts a Telegram chat ID at rest using AES-256-GCM (format: iv.tag.ciphertext in base64url). */
export function encryptChatId(chatId: string, encryptionKey: string): string {
  const key = deriveAesKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(chatId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** Decrypts a stored AES-256-GCM Telegram chat ID. */
export function decryptChatId(payload: string, encryptionKey: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("invalid encrypted chatId payload");
  const key = deriveAesKey(encryptionKey);
  const iv = Buffer.from(parts[0]!, "base64url");
  const tag = Buffer.from(parts[1]!, "base64url");
  const ciphertext = Buffer.from(parts[2]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Deterministic lookup hash for webhook chat IDs (never store plaintext lookup keys). */
export function hashChatId(chatId: string, secret: string): string {
  return createHmac("sha256", secret).update(`tg-chat:${chatId}`).digest("hex");
}

/** Generates a human-typeable 8-character single-use link code. */
export function generateLinkCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += LINK_ALPHABET[bytes[i]! % LINK_ALPHABET.length]!;
  }
  return out;
}

export function hashLinkCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(`tg-link:${code.trim().toUpperCase()}`).digest("hex");
}
