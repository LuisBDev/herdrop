import { describe, expect, it } from 'vitest';
import { createVisibilityReporter } from './visibility.ts';

function setup() {
  const sent: { url: string; offscreen: string[] }[] = [];
  const reporter = createVisibilityReporter(
    async (data) => {
      sent.push(data);
    },
    () => 'https://example.com/',
  );
  return { sent, reporter };
}

describe('createVisibilityReporter', () => {
  it('update_sends_on_first_call_and_only_when_the_set_changes', () => {
    const { sent, reporter } = setup();
    reporter.update(['a', 'b']);
    reporter.update(['b', 'a']);
    reporter.update(['a']);
    expect(sent).toEqual([
      { url: 'https://example.com/', offscreen: ['a', 'b'] },
      { url: 'https://example.com/', offscreen: ['a'] },
    ]);
  });

  it('report_resends_last_set', () => {
    const { sent, reporter } = setup();
    reporter.update(['a']);
    reporter.report();
    reporter.report();
    expect(sent).toEqual([
      { url: 'https://example.com/', offscreen: ['a'] },
      { url: 'https://example.com/', offscreen: ['a'] },
      { url: 'https://example.com/', offscreen: ['a'] },
    ]);
  });
});
