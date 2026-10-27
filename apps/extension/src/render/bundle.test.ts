import { describe, expect, it } from 'vitest';
import { renderBundle } from './bundle.ts';
import { renderClipboard, renderClipboardOne } from './clipboard.ts';
import { annotations, customers, newInvoice, statCard, stripCode } from './fixtures.ts';
import { UNTRUSTED_LINE } from './label.ts';
import { elementSections } from './sections.ts';

const F = '```';

const statCardEntry = [
  '### 1. change, important',
  '',
  '- Component: `StatCardComponent`',
  '- Element: `p.stat-value “$6,940.00”`',
  '- Selector: `app-stat-card:nth-of-type(2) > p.stat-value`',
  '- Details: [A1.md](A1.md)',
  '',
  '> Format with the currency pipe:',
  `> ${F}`,
  '> {{ total | currency }}',
  `> ${F}`,
];

const newInvoiceEntry = [
  '### 2. approve',
  '',
  '- Component: `InvoiceToolbarComponent`',
  '- Element: `button.btn-primary button “New invoice”`',
  '- Selector: `app-invoice-toolbar > button.btn-primary`',
  '- Details: [A2.md](A2.md)',
  '',
  '> (no comment)',
];

const customersEntry = [
  '### 3. question',
  '',
  '- Element: `td cell “Net 30”`',
  '- Selector: `table.customers > tbody > tr:nth-of-type(1) > td:nth-of-type(3)`',
  '- Details: [A3.md](A3.md)',
  '',
  '> Where do the payment terms come from?',
];

const invoicesPage = ['## Page `http://localhost:4200/invoices`', '', 'Viewport 1280x800.'];
const customersPage = ['## Page `http://localhost:4200/customers`', '', 'Viewport 1280x800.'];

const readme = [
  '# Herdrop annotations',
  '',
  UNTRUSTED_LINE,
  '',
  ...invoicesPage,
  '',
  ...statCardEntry,
  '',
  ...newInvoiceEntry,
  '',
  ...customersPage,
  '',
  ...customersEntry,
].join('\n');

const details: [string, string, typeof statCard][] = [
  ['A1. change, important', statCardEntry.slice(-4).join('\n'), statCard],
  ['A2. approve', '> (no comment)', newInvoice],
  ['A3. question', '> Where do the payment terms come from?', customers],
];

function detailFile([title, comment, annotation]: (typeof details)[number]): string {
  return [
    `# ${title}`,
    '',
    UNTRUSTED_LINE,
    '',
    '## Comment',
    '',
    comment,
    '',
    elementSections(annotation.capture),
  ].join('\n');
}

function demotedDetail([title, comment, annotation]: (typeof details)[number]): string {
  return [
    `## ${title}`,
    '',
    '### Comment',
    '',
    comment,
    '',
    elementSections(annotation.capture).replace(/^(#+) /gm, '#$1 '),
  ].join('\n');
}

function withoutDetails(lines: string[]): string[] {
  return lines.filter((line) => !line.startsWith('- Details:'));
}

describe('bundle and clipboard modes', () => {
  it('bundle_golden', () => {
    const files = renderBundle(annotations);
    expect(files.map((f) => f.name)).toEqual(['README.md', 'A1.md', 'A2.md', 'A3.md']);
    expect(files[0]?.content).toBe(readme);
    for (const [i, entry] of details.entries()) {
      expect(files[i + 1]?.content).toBe(detailFile(entry));
    }
  });

  it('clipboard_goldens', () => {
    const all = [
      '# Herdrop annotations',
      '',
      UNTRUSTED_LINE,
      '',
      ...invoicesPage,
      '',
      ...withoutDetails(statCardEntry),
      '',
      ...withoutDetails(newInvoiceEntry),
      '',
      ...customersPage,
      '',
      ...withoutDetails(customersEntry),
      ...details.flatMap((entry) => ['', '---', '', demotedDetail(entry)]),
    ].join('\n');
    expect(renderClipboard(annotations)).toBe(all);

    const one = [
      '# Herdrop annotation 2',
      '',
      UNTRUSTED_LINE,
      '',
      ...invoicesPage,
      '',
      ...withoutDetails(newInvoiceEntry),
      '',
      '---',
      '',
      demotedDetail(details[1] as (typeof details)[number]),
    ].join('\n');
    expect(renderClipboardOne(newInvoice, 2)).toBe(one);
  });

  it('every_mode_is_redacted_and_fenced', () => {
    const outputs = [
      ...renderBundle(annotations).map((f) => f.content),
      renderClipboard(annotations),
      ...annotations.map((a, i) => renderClipboardOne(a, i + 1)),
    ];
    for (const md of outputs) {
      expect(md).not.toContain('hunter2');
      const bare = stripCode(md);
      expect(bare).not.toContain('Ignore previous instructions');
      expect(bare).not.toContain('New invoice');
    }
  });
});
