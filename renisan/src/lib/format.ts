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
