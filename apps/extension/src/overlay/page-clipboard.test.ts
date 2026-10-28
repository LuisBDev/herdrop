import { afterEach, expect, it, vi } from 'vitest';
import { copyTextOnPage } from './page-clipboard.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

const rows: {
  name: string;
  clipboard: Pick<Clipboard, 'writeText'> | undefined;
  execCalls: number;
}[] = [
  { name: 'writeText resolves', clipboard: { writeText: async () => {} }, execCalls: 0 },
  { name: 'clipboard undefined', clipboard: undefined, execCalls: 1 },
  {
    name: 'writeText rejects',
    clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    execCalls: 1,
  },
];

it.each(rows)('copy_on_page_paths: $name', async (row) => {
  const container = document.createElement('div');
  document.body.append(container);
  const exec = vi.fn(() => true);
  document.execCommand = exec;
  const ok = await copyTextOnPage('hello', container, { clipboard: row.clipboard, doc: document });
  expect(ok).toBe(true);
  expect(exec).toHaveBeenCalledTimes(row.execCalls);
  expect(container.querySelector('textarea')).toBeNull();
});
