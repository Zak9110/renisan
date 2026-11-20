import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Hard rule 10: never hardcode left/right. Use ms-/me-/ps-/pe-/start-/end-/text-start.
const PHYSICAL =
  /^-?((ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-.+|(border|rounded)-[lr](-.+)?|rounded-(tl|tr|bl|br)(-.+)?|(text|float|clear)-(left|right))$/;
const CSS_PHYSICAL =
  /\b(margin|padding|border)-(left|right)\b|\btext-align:\s*(left|right)\b|^\s*(left|right)\s*:/m;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("logical CSS only", () => {
  it("the rule itself flags physical classes and allows logical ones", () => {
    for (const c of ["ml-2", "pr-4", "left-0", "text-right", "border-l-2", "rounded-r-lg", "-mr-1"])
      expect(PHYSICAL.test(c)).toBe(true);
    for (const c of [
      "ms-2",
      "pe-4",
      "start-0",
      "text-start",
      "border-s-4",
      "rounded-lg",
      "rounded-e-lg",
      "px-4",
    ])
      expect(PHYSICAL.test(c)).toBe(false);
  });
  const src = new URL("../../src", import.meta.url).pathname;
  it("no physical left/right Tailwind classes in components", () => {
    const offenders: string[] = [];
    for (const f of files(src).filter((f) => f.endsWith(".tsx"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/className="([^"]*)"/g)) {
        const hits = (m[1] ?? "").split(/\s+/).filter((c) => PHYSICAL.test(c.replace(/^([\w[\]=-]+:)+/, "")));
        if (hits.length) offenders.push(`${f}: ${hits.join(" ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it("no physical left/right properties in CSS files", () => {
    const offenders = files(src)
      .filter((f) => f.endsWith(".css"))
      .filter((f) => CSS_PHYSICAL.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
