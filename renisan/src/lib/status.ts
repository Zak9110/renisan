// ============================================
// Renisan — Scholarship status helpers
// The dataset's `status` is a curated snapshot; deadlines move on without it.
// These helpers derive what a student should actually see *today*.
// ============================================

import type { Scholarship } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when the scholarship has a concrete ISO deadline (YYYY-MM-DD) that is
 * before `today`. The deadline day itself still counts as open.
 */
export function isDeadlinePassed(s: Pick<Scholarship, 'deadline'>, today: Date = new Date()): boolean {
  if (!s.deadline || !ISO_DATE.test(s.deadline)) return false;
  const [y, m, d] = s.deadline.split('-').map(Number);
  const endOfDeadline = new Date(y, m - 1, d, 23, 59, 59, 999);
  return endOfDeadline.getTime() < today.getTime();
}

/**
 * The status to display/filter on: an "open" or "upcoming" listing whose
 * deadline has passed is treated as "closed" until the data is re-verified.
 */
export function getEffectiveStatus(
  s: Pick<Scholarship, 'status' | 'deadline'>,
  today: Date = new Date()
): Scholarship['status'] {
  if ((s.status === 'open' || s.status === 'upcoming') && isDeadlinePassed(s, today)) {
    return 'closed';
  }
  return s.status;
}
