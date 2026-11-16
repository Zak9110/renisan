import { useState, useEffect, useCallback } from 'preact/hooks';
import { getThemePreference, setThemePreference, onThemeChange, resolveTheme, type ThemePreference, type ResolvedTheme } from '../lib/theme';

export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference());
  const [resolved, setResolved] = useState<ResolvedTheme>(resolveTheme());

  useEffect(() => onThemeChange((p, r) => { setPref(p); setResolved(r); }), []);

  const cycle = useCallback(() => {
    const order: ThemePreference[] = ['system', 'dark', 'light'];
    const next = order[(order.indexOf(getThemePreference()) + 1) % order.length];
    setThemePreference(next);
  }, []);

  return { pref, resolved, setTheme: setThemePreference, cycle };
}
