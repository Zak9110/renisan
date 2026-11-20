import { z } from "zod";

// Placeholder values copied from .env.example must never reach production.
const notPlaceholder = (v: string) => !/change-me/i.test(v);

const databaseUrl = z
  .string()
  .min(1)
  .refine((v) => /^(postgres(ql)?:\/\/|pglite:\/\/)/.test(v), "must start with postgres:// or pglite://");

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Deployment environment (docs/ARCHITECTURE.md). NODE_ENV is "production" for any `next start`,
    // including e2e runs, so the strict production checks key off APP_ENV instead.
    APP_ENV: z.enum(["local", "test", "preview", "production"]).optional(),
    DATABASE_URL: databaseUrl,
    APP_URL: z.url(),
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
    CRON_SECRET: z.string().min(16, "must be at least 16 characters"),
    SMS_PROVIDER: z.enum(["console", "otpiq"]).default("console"),
    OTPIQ_API_KEY: z.string().optional(),
    EMAIL_PROVIDER: z.enum(["console"]).default("console"),
    EMAIL_FROM: z.email().default("no-reply@example.org"),
    EMAIL_API_KEY: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    TELEGRAM_CHATID_ENCRYPTION_KEY: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(["manual", "zaincash", "fastpay"]).default("manual"),
    ANALYTICS_DOMAIN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.SMS_PROVIDER === "otpiq" && !env.OTPIQ_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["OTPIQ_API_KEY"], message: "required when SMS_PROVIDER=otpiq" });
    }
    if (env.NODE_ENV === "production" && !env.APP_ENV) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ENV"],
        message: "required for production builds (local | test | preview | production)",
      });
    }
    if (env.APP_ENV !== "production") return;
    for (const key of [
      "SESSION_SECRET",
      "CRON_SECRET",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_CHATID_ENCRYPTION_KEY",
    ] as const) {
      const v = env[key];
      if (v && !notPlaceholder(v))
        ctx.addIssue({ code: "custom", path: [key], message: "placeholder value in production" });
    }
    if (env.SMS_PROVIDER === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message: "console SMS provider is not allowed in production",
      });
    }
    if (env.DATABASE_URL.startsWith("pglite://")) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "PGlite is for local dev and tests only",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parse and validate env. Error messages name the variable, never its value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
