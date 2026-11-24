export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export interface TelegramSender {
  sendMessage(chatId: string, text: string): Promise<TelegramSendResult>;
}

/** Calls the official Telegram Bot API sendMessage endpoint without logging chat IDs or tokens. */
export class HttpTelegramSender implements TelegramSender {
  constructor(private readonly botToken: string) {}

  async sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return { ok: false, error: `telegram_http_${res.status}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "telegram_network_error" };
    }
  }
}

/** Safe local/dev sender when TELEGRAM_BOT_TOKEN is unset; records nothing with PII. */
export class NoopTelegramSender implements TelegramSender {
  async sendMessage(): Promise<TelegramSendResult> {
    return { ok: true };
  }
}

export function createTelegramSender(botToken: string | undefined): TelegramSender {
  return botToken && botToken.trim().length > 0 ? new HttpTelegramSender(botToken) : new NoopTelegramSender();
}
