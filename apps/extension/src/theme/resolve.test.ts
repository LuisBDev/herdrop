import { describe, expect, it } from 'vitest';
import { resolveTheme } from './resolve.ts';

describe('resolveTheme', () => {
  it('resolve_theme_table', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
