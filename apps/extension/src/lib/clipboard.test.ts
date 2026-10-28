import { afterEach, expect, it } from 'vitest';
import { copyText } from './clipboard.ts';

const original = document.execCommand;

afterEach(() => {
  document.execCommand = original;
  document.body.innerHTML = '';
});

const denied = () =>
  Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));

it.each([
  {
    name: 'writeText resolves',
    clipboard: { writeText: async () => {} },
    execs: false,
    expected: true,
    fallbackCopied: null,
  },
  {
    name: 'clipboard undefined',
    clipboard: undefined,
    execs: true,
    expected: true,
    fallbackCopied: 'brief',
  },
  {
    name: 'writeText rejects',
    clipboard: { writeText: denied },
    execs: true,
    expected: true,
    fallbackCopied: 'brief',
  },
  {
    name: 'both fail',
    clipboard: { writeText: denied },
    execs: false,
    expected: false,
    fallbackCopied: 'brief',
  },
])('copy_text_paths: $name', async (c) => {
  const container = document.createElement('div');
  document.body.append(container);
  let fallbackCopied: string | null = null;
  document.execCommand = (command: string) => {
    const area = container.querySelector('textarea');
    if (command === 'copy' && area) fallbackCopied = area.value;
    return c.execs;
  };

  expect(await copyText('brief', container, { clipboard: c.clipboard, doc: document })).toBe(
    c.expected,
  );
  expect(fallbackCopied).toBe(c.fallbackCopied);
  expect(container.querySelector('textarea')).toBeNull();
});
