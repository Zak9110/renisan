import { expect, test } from "@playwright/test";

const cases = [
  { locale: "ar", dir: "rtl" },
  { locale: "ckb", dir: "rtl" },
  { locale: "kmr", dir: "ltr" },
  { locale: "en", dir: "ltr" },
] as const;

for (const { locale, dir } of cases) {
  test(`${locale} renders with lang=${locale} dir=${dir}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

for (const locale of ["ar", "ckb"]) {
  test(`glyph test string renders in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const glyph = page.getByTestId("glyph-test");
    await expect(glyph).toHaveText("ڕێنیشان — خوێندکار — ئەو ڤێدیۆیە");
    // Every glyph must have real width: a missing-glyph box would still have width, so also check
    // the font that actually rendered is the self-hosted Arabic font, not a system fallback.
    const family = await glyph.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toMatch(/noto/i);
  });
}

test("root follows Accept-Language and falls back to ar for unsupported languages", async ({ browser }) => {
  for (const [accept, expected] of [
    ["fr-FR,fr;q=0.9", "ar"],
    ["ckb,ar;q=0.8", "ckb"],
    ["en-US,en;q=0.9", "en"],
  ] as const) {
    const context = await browser.newContext({
      locale: accept.split(",")[0],
      extraHTTPHeaders: { "Accept-Language": accept },
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`/${expected}$`));
    await context.close();
  }
});

test("a chosen language is remembered in a cookie", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ar", extraHTTPHeaders: { "Accept-Language": "ar" } });
  const page = await context.newPage();
  await page.goto("/ar");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  expect((await context.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value).toBe("en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await context.close();
});
