export interface SmsSendResult {
  ok: boolean;
  provider: string;
  /** Only populated by ConsoleSmsProvider in local/test dev environments. */
  devCode?: string;
}

export interface SmsProvider {
  sendOtp(phoneE164: string, code: string): Promise<SmsSendResult>;
}

/**
 * Local dev/test SMS provider. Never logs the raw phone number or OTP code (hard rule 9).
 */
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(_phoneE164: string, code: string): Promise<SmsSendResult> {
    return { ok: true, provider: "console", devCode: code };
  }
}

/**
 * OTPIQ provider for Iraqi carriers (Asiacell / Zain / Korek) using smart
 * whatsapp-sms fallback (~40 IQD WhatsApp, ~80 IQD SMS).
 */
export class OtpiqSmsProvider implements SmsProvider {
  constructor(private readonly apiKey: string) {}

  async sendOtp(phoneE164: string, code: string): Promise<SmsSendResult> {
    const res = await fetch("https://api.otpiq.com/api/sms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber: phoneE164.replace(/^\+/, ""),
        smsType: "verification",
        provider: "whatsapp-sms",
        verificationCode: code,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, provider: "otpiq" };
  }
}

export function createSmsProvider(kind: "console" | "otpiq", apiKey?: string): SmsProvider {
  if (kind === "otpiq") {
    if (!apiKey) throw new Error("OTPIQ_API_KEY is required when SMS_PROVIDER=otpiq");
    return new OtpiqSmsProvider(apiKey);
  }
  return new ConsoleSmsProvider();
}
