// ============================================
// Renisan — tiny string helpers shared by components
// ============================================

/** Replaces every `{key}` in a translation string. Missing keys are left as-is. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : m
  );
}

/** Formats a cutoff for display: integers stay short, decimals keep two places. */
export function formatAverage(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

/** Signed margin for display: "+3.25", "−0.40", "±0" (true minus sign, no "+0.0"). */
export function formatDelta(diff: number): string {
  const r = Math.round(diff * 100) / 100;
  if (Math.abs(r) < 0.005) return '±0';
  const abs = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(2);
  return `${r > 0 ? '+' : '−'}${abs}`;
}
