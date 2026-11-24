import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      APP_ENV: "test",
      NEXT_PUBLIC_PHASE2_ENABLED: "true",
      DATABASE_URL: "pglite://memory",
      APP_URL: `http://localhost:${PORT}`,
      SESSION_SECRET: "e2e-only-session-secret-0123456789abcdef",
      CRON_SECRET: "e2e-only-cron-secret",
      TELEGRAM_WEBHOOK_SECRET: "e2e-only-tg-webhook-secret",
      TELEGRAM_CHATID_ENCRYPTION_KEY: "e2e-only-tg-enc-key-0123456789ab",
    },
  },
});
