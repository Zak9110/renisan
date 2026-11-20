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

export function createEmailProvider(): EmailProvider {
  return new ConsoleEmailProvider();
}
