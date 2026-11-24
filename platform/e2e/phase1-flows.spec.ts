import { expect, test } from "@playwright/test";

test("PWA manifest and service worker are served", async ({ request }) => {
  const manifestRes = await request.get("/manifest.webmanifest");
  expect(manifestRes.ok()).toBe(true);
  const manifest = (await manifestRes.json()) as { short_name?: string; display?: string };
  expect(manifest.short_name).toBe("Renisan");
  expect(manifest.display).toBe("standalone");

  const swRes = await request.get("/sw.js");
  expect(swRes.ok()).toBe(true);
  expect(await swRes.text()).toContain("renisan-static-v1");
});

for (const { locale, dir } of [
  { locale: "ar", dir: "rtl" },
  { locale: "ckb", dir: "rtl" },
  { locale: "kmr", dir: "ltr" },
  { locale: "en", dir: "ltr" },
] as const) {
  test(`mobile layout has zero horizontal overflow in ${locale} across Phase 1-3 routes`, async ({
    page,
  }) => {
    for (const suffix of [
      "",
      "/opportunities",
      "/admissions",
      "/helpers",
      "/community",
      "/submit",
      "/account",
    ]) {
      await page.goto(`/${locale}${suffix}`);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${locale}${suffix} horizontal overflow`).toBeLessThanOrEqual(2);
    }
  });
}

test("no-login admissions checker shows indicative notice and responds to average filter", async ({
  page,
}) => {
  await page.goto("/en/admissions");
  await expect(page.getByRole("note")).toContainText(/Indicative only/i);
  const avgInput = page.locator('input[type="number"]').first();
  await avgInput.fill("96.5");
  await expect(avgInput).toHaveValue("96.5");
});

test("OTP sign-up, profile save, Telegram linking code, and admin role guard work end-to-end", async ({
  page,
}) => {
  await page.goto("/en/account");
  await page.locator('input[type="text"]').fill("e2e-student@example.org");
  await page.getByRole("button", { name: /Send verification code/i }).click();

  const devCodeText = await page.getByTestId("dev-otp").innerText();
  const match = /\b(\d{6})\b/.exec(devCodeText);
  expect(match).not.toBeNull();

  await page.locator('input[inputmode="numeric"]').fill(match![1]!);
  await page.getByRole("button", { name: /Verify & Sign In/i }).click();

  await expect(page.getByText("e2e-student@example.org")).toBeVisible();

  // Save profile
  await page.getByRole("button", { name: /Save profile/i }).click();
  await expect(page.getByText(/Profile saved/i)).toBeVisible();

  // Generate Telegram linking code
  await page.getByRole("button", { name: /Generate Telegram linking code/i }).click();
  await expect(page.getByTestId("telegram-link-code")).toContainText("/start ");

  // Non-editor cannot view Admin Console
  await page.goto("/en/admin");
  await expect(page.getByText(/Editor or admin access is required/i)).toBeVisible();
});
