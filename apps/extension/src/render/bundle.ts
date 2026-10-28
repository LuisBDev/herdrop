import type { BundleFile } from '@herdrop/protocol';
import type { Annotation } from '../draft/model.ts';
import { componentName, elementLabel, UNTRUSTED_LINE } from './label.ts';
import { inlineCode, quote } from './markdown.ts';
import { redact } from './redact.ts';
import { elementSections } from './sections.ts';

export type Numbered = { annotation: Annotation; number: number };

function code(text: string): string {
  return inlineCode(redact(text));
}

function title({ annotation, number }: Numbered): string {
  const priority = annotation.priority === null ? '' : `, ${annotation.priority}`;
  return `${number}. ${annotation.intent}${priority}`;
}

function comment(annotation: Annotation): string {
  return annotation.comment.trim() === '' ? '> (no comment)' : quote(redact(annotation.comment));
}

function entry(item: Numbered, details: boolean): string {
  const { capture } = item.annotation;
  const component = componentName(capture);
  const lines = [
    ...(component === null ? [] : [`- Component: ${code(component)}`]),
    `- Element: ${code(elementLabel(capture))}`,
    `- Selector: ${code(capture.target.selector)}`,
    ...(details ? [`- Details: [A${item.number}.md](A${item.number}.md)`] : []),
  ];
  return [`### ${title(item)}`, lines.join('\n'), comment(item.annotation)].join('\n\n');
}

function pages(items: Numbered[]): Numbered[][] {
  const byUrl = new Map<string, Numbered[]>();
  for (const item of items) {
    const url = item.annotation.capture.page.url;
    const group = byUrl.get(url);
    if (group) group.push(item);
    else byUrl.set(url, [item]);
  }
  return [...byUrl.values()];
}

function pageBlock(group: Numbered[], details: boolean): string {
  const { url, viewport } = (group[0] as Numbered).annotation.capture.page;
  return [
    `## Page ${code(url)}`,
    `Viewport ${viewport.width}x${viewport.height}.`,
    ...group.map((item) => entry(item, details)),
  ].join('\n\n');
}

export function numbered(annotations: Annotation[]): Numbered[] {
  return annotations.map((annotation, i) => ({ annotation, number: i + 1 }));
}

export function summary(heading: string, items: Numbered[], details: boolean): string {
  return [
    `# ${heading}`,
    UNTRUSTED_LINE,
    ...pages(items).map((group) => pageBlock(group, details)),
  ].join('\n\n');
}

export function detail(item: Numbered, untrusted: boolean): string {
  return [
    `# A${title(item)}`,
    ...(untrusted ? [UNTRUSTED_LINE] : []),
    '## Comment',
    comment(item.annotation),
    elementSections(item.annotation.capture),
  ].join('\n\n');
}

export function renderBundle(annotations: Annotation[]): BundleFile[] {
  const items = numbered(annotations);
  return [
    { name: 'README.md', content: summary('Herdrop annotations', items, true) },
    ...items.map((item) => ({ name: `A${item.number}.md`, content: detail(item, true) })),
  ];
}
