import { afterEach, expect, it, vi } from 'vitest';
import { copyTextOnPage } from './page-clipboard.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

const rows: { name: string; clipboard: Pick<Clipboard, 'writeText'> | undefined }[] = [
  { name: 'writeText resolves', clipboard: { writeText: async () => {} } },
  { name: 'clipboard undefined', clipboard: undefined },
  {
    name: 'writeText rejects',
    clipboard: { writeText: () => Promise.reject(new Error('denied')) },
  },
];

it.each(rows)('copy_on_page_paths: $name', async ({ clipboard }) => {
  const container = document.createElement('div');
  document.body.append(container);
  const exec = vi.fn(() => true);
  document.execCommand = exec;
  const ok = await copyTextOnPage('hello', container, { clipboard, doc: document });
  expect(ok).toBe(true);
  expect(container.querySelector('textarea')).toBeNull();
});
