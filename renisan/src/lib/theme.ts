// ============================================
// Renisan — Theme (dark / light / system)
// Dark is the design default; light follows the OS when the student chooses "system".
// ============================================

export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'renisan_theme';
const PREFS: readonly ThemePreference[] = ['system', 'dark', 'light'];
const listeners = new Set<(pref: ThemePreference, resolved: ResolvedTheme) => void>();

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (PREFS as readonly string[]).includes(v)) return v as ThemePreference;
  } catch {
    // storage blocked — fall through
  }
  return 'system';
}

/** `?theme=light|dark|system` in the URL overrides (and saves) the preference — handy for shared links. */
function readUrlOverride(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('theme');
  return v && (PREFS as readonly string[]).includes(v) ? (v as ThemePreference) : null;
}

let current: ThemePreference = readUrlOverride() ?? readStored();

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(pref: ThemePreference = current): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

export function getThemePreference(): ThemePreference {
  return current;
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme();
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#f8fafc' : '#0f172a';
  listeners.forEach((fn) => fn(current, resolved));
}

export function setThemePreference(pref: ThemePreference): void {
  current = pref;
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Non-fatal: the choice just won't persist
  }
  apply();
}

export function onThemeChange(fn: (pref: ThemePreference, resolved: ResolvedTheme) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Apply on load and follow OS changes while in "system" mode
if (typeof window !== 'undefined') {
  if (readUrlOverride()) setThemePreference(current); else apply();
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => { if (current === 'system') apply(); };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (typeof mq.addListener === 'function') mq.addListener(handler);
  }
}
