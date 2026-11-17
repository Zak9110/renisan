// ============================================
// Renisan — Wishlist / Saved Items Store
// Manages student preferences locally in localStorage
// ============================================

import type { FederalCutoff, KRGCutoff, Scholarship } from './types';

export interface WishlistItem {
  id: string;
  type: 'federal' | 'krg' | 'scholarship';
  title: string;
  subtitle: string;
  location?: string;
  score?: number;
  studyType?: string;
  channel?: string;
  url?: string;
  raw: FederalCutoff | KRGCutoff | Scholarship;
  addedAt: number;
}

const STORAGE_KEY = 'renisan_wishlist';
const listeners = new Set<() => void>();

export function getWishlist(): WishlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isWishlisted(id: string): boolean {
  return getWishlist().some(item => item.id === id);
}

export function toggleWishlist(item: WishlistItem): boolean {
  const current = getWishlist();
  const exists = current.some(x => x.id === item.id);
  let next: WishlistItem[];
  if (exists) {
    next = current.filter(x => x.id !== item.id);
  } else {
    next = [item, ...current];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded or private mode
  }
  listeners.forEach(cb => cb());
  return !exists;
}

export function removeWishlistItem(id: string): void {
  const next = getWishlist().filter(x => x.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach(cb => cb());
}

/** Moves an item one step up or down so the list can mirror the order of the official form. */
export function moveWishlistItem(id: string, direction: -1 | 1): void {
  const list = getWishlist();
  const from = list.findIndex((x) => x.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  listeners.forEach(cb => cb());
}

export function clearWishlist(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach(cb => cb());
}

export function onWishlistChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
