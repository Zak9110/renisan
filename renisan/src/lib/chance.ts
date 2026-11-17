// ============================================
// Renisan — admission chance bands
// A student's margin over last published cutoff, bucketed so cards, the results
// summary and the wishlist all speak the same language.
// ============================================

export type ChanceBand = 'safe' | 'target' | 'reach';

/** Margin (points) at or above which a programme counts as comfortably within reach. */
export const SAFE_MARGIN = 2;

/** `diff` = student score − programme cutoff. */
export function chanceBand(diff: number): ChanceBand {
  if (diff >= SAFE_MARGIN) return 'safe';
  if (diff >= 0) return 'target';
  return 'reach';
}

export function countBands(diffs: number[]): Record<ChanceBand, number> {
  const out: Record<ChanceBand, number> = { safe: 0, target: 0, reach: 0 };
  for (const d of diffs) out[chanceBand(d)]++;
  return out;
}
