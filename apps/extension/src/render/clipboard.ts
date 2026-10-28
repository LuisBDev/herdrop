import type { Annotation } from '../draft/model.ts';
import { detail, type Numbered, numbered, summary } from './bundle.ts';

function demote(md: string): string {
  let closing: string | null = null;
  return md
    .split('\n')
    .map((line) => {
      if (closing !== null) {
        if (line === closing) closing = null;
        return line;
      }
      const open = /^`{3,}/.exec(line);
      if (open) {
        closing = open[0];
        return line;
      }
      return /^#{1,5} /.test(line) ? `#${line}` : line;
    })
    .join('\n');
}

function clipboard(heading: string, items: Numbered[]): string {
  return [
    summary(heading, items, false),
    ...items.map((item) => `---\n\n${demote(detail(item, false))}`),
  ].join('\n\n');
}

export function renderClipboard(annotations: Annotation[]): string {
  return clipboard('Herdrop annotations', numbered(annotations));
}

export function renderClipboardOne(annotation: Annotation, number: number): string {
  return clipboard(`Herdrop annotation ${number}`, [{ annotation, number }]);
}
