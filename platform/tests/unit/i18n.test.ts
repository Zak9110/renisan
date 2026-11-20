import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { locales, direction, dirOf, defaultLocale, pickText, GLYPH_TEST } from "@/i18n/config";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), "utf8"));

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("i18n direction", () => {
  it("maps ar and ckb to rtl, kmr and en to ltr", () => {
    expect(direction).toEqual({ ar: "rtl", ckb: "rtl", kmr: "ltr", en: "ltr" });
  });
  it("defaults to ar and falls back to its direction for unknown locales", () => {
    expect(defaultLocale).toBe("ar");
    expect(dirOf("xx")).toBe("rtl");
  });
  it("glyph test string contains the Sorani letters the font must render", () => {
    for (const ch of ["ڕ", "ێ", "ڤ", "ۆ", "ە"]) expect(GLYPH_TEST).toContain(ch);
  });
});

describe("messages", () => {
  const en = flatKeys(load("en")).sort();
  it.each(locales)("%s has exactly the same keys as en, none empty", (l) => {
    const dict = load(l);
    expect(flatKeys(dict).sort()).toEqual(en);
    for (const key of flatKeys(dict)) {
      const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict);
      expect(typeof value === "string" && value.trim().length > 0, `${l}:${key}`).toBe(true);
    }
  });
  it.each(["ckb", "kmr"])("%s review list only names real keys", (l) => {
    const path = new URL(`../../messages/${l}.review.json`, import.meta.url);
    expect(existsSync(path)).toBe(true);
    const review = JSON.parse(readFileSync(path, "utf8")) as { unreviewed: string[] };
    for (const key of review.unreviewed) expect(en).toContain(key);
  });
});

describe("pickText fallback", () => {
  it("uses the locale, then en, then any available", () => {
    expect(pickText({ ckb: "a", en: "b" }, "ckb")).toBe("a");
    expect(pickText({ ar: "x", en: "b" }, "kmr")).toBe("b");
    expect(pickText({ ar: "x" }, "kmr")).toBe("x");
    expect(pickText(null, "en")).toBe("");
  });
});
