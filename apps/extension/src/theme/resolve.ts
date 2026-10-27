export function resolveTheme(
  pref: 'system' | 'light' | 'dark' | undefined,
  systemDark: boolean,
): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark ? 'dark' : 'light';
}
