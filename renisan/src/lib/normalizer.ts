// ============================================
// Renisan — Input normalizer for Arabic/Persian/Kurdish digit handling
// ============================================

/**
 * Normalizes Eastern Arabic (٠-٩) and Persian/Kurdish (۰-۹) digits to Western ASCII (0-9).
 * Also normalizes Arabic comma (،) to decimal point (.).
 * Critical for mobile keyboard input on Iraqi Android devices.
 */
export function normalizeScoreInput(input: string): string {
  const eastArabic = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  const persian    = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];

  let normalized = input;
  for (let i = 0; i < 10; i++) {
    normalized = normalized.replace(eastArabic[i], String(i));
    normalized = normalized.replace(persian[i], String(i));
  }

  // Normalize Arabic decimal comma to standard decimal point
  normalized = normalized.replace(/،/g, '.');
  // Remove any non-numeric characters except decimal point
  normalized = normalized.replace(/[^\d.]/g, '');
  // Ensure only one decimal point
  const parts = normalized.split('.');
  if (parts.length > 2) {
    normalized = parts[0] + '.' + parts.slice(1).join('');
  }

  return normalized.trim();
}

/**
 * Alias for normalizeScoreInput
 */
export const normalizeDigits = normalizeScoreInput;

/**
 * Checks if a string can be converted to a valid number
 */
export function isConvertibleScore(input: string): boolean {
  const norm = normalizeScoreInput(input);
  const n = parseFloat(norm);
  return !isNaN(n) && isFinite(n);
}

/**
 * Highest competitive average the Federal system can produce. Since 2025-2026 the
 * ministry adds 8% of the foreign-language mark to the total, so top averages
 * exceed 100 (Baghdad Medicine 2026-2027: 101.29).
 */
export const MAX_SCORE_FEDERAL = 110;
/** Zankoline composite scores are plain percentages. */
export const MAX_SCORE_KRG = 100;

/**
 * Validates a score is a finite number within [0, max]. `max` defaults to the
 * Federal ceiling so official rows above 100 are accepted.
 */
export function validateScore(score: number, max: number = MAX_SCORE_FEDERAL): boolean {
  return Number.isFinite(score) && score >= 0 && score <= max;
}

/**
 * Computes the KRG weighted composite score.
 * Formula: (Grade 12 × 0.80) + (Grade 11 × 0.10) + (Grade 10 × 0.10)
 * Uses the "best-of" rule: max(grade12, composite) — Grades 10/11 can only help.
 */
export function computeKRGComposite(
  grade12: number,
  grade11?: number,
  grade10?: number
): number {
  if (grade11 === undefined || grade10 === undefined) {
    return grade12;
  }
  const composite = (grade12 * 0.80) + (grade11 * 0.10) + (grade10 * 0.10);
  // Best-of protection: G10/G11 can only raise the score
  return Math.max(grade12, composite);
}

/**
 * Formats a score for display with proper decimal places.
 */
export function formatScore(score: number): string {
  return score % 1 === 0 ? score.toString() : score.toFixed(2);
}
