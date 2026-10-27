import { afterEach, expect, it } from 'vitest';
import { copyText } from './clipboard.ts';

const original = document.execCommand;

afterEach(() => {
  document.execCommand = original;
});

it('copy_text_paths', async () => {
  const cases = [
    { writes: true, execs: false, expected: true, fallbackCopied: null },
    { writes: false, execs: true, expected: true, fallbackCopied: 'brief' },
    { writes: false, execs: false, expected: false, fallbackCopied: 'brief' },
  ];
  for (const c of cases) {
    let fallbackCopied: string | null = null;
    document.execCommand = (command: string) => {
      const area = document.body.querySelector('textarea');
      if (command === 'copy' && area) fallbackCopied = area.value;
      return c.execs;
    };
    const clipboard = {
      writeText: () =>
        c.writes
          ? Promise.resolve()
          : Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')),
    };

    expect(await copyText('brief', { clipboard, doc: document })).toBe(c.expected);
    expect(fallbackCopied).toBe(c.fallbackCopied);
    expect(document.body.querySelector('textarea')).toBeNull();
  }
});
