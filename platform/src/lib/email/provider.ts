export interface EmailSendResult {
  ok: boolean;
  provider: string;
  /** Only populated by ConsoleEmailProvider in local/test dev environments. */
  devCode?: string;
}

export interface EmailProvider {
  sendOtp(email: string, code: string): Promise<EmailSendResult>;
}

/** Local dev/test Email provider. Never logs raw email or OTP code (hard rule 9). */
export class ConsoleEmailProvider implements EmailProvider {
  async sendOtp(_email: string, code: string): Promise<EmailSendResult> {
    return { ok: true, provider: "console", devCode: code };
  }
}

/** Production Email OTP delivery via Resend REST API (free up to 3,000 emails/mo). */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendOtp(email: string, code: string): Promise<EmailSendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: "Renisan — Your verification code",
        text: `Your Renisan verification code is: ${code}\n\nIt expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, provider: "resend" };
  }
}

export function createEmailProvider(
  kind: "console" | "resend" = "console",
  apiKey?: string,
  from = "no-reply@example.org",
): EmailProvider {
  if (kind === "resend") {
    if (!apiKey) throw new Error("EMAIL_API_KEY is required when EMAIL_PROVIDER=resend");
    return new ResendEmailProvider(apiKey, from);
  }
  return new ConsoleEmailProvider();
}
