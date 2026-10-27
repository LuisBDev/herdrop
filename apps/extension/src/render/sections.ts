import type { Capture, StyleKey } from '../capture/types.ts';
import { fence, inlineCode } from './markdown.ts';
import { redact } from './redact.ts';

const STYLE_KEYS: StyleKey[] = [
  'display',
  'position',
  'width',
  'height',
  'margin',
  'padding',
  'color',
  'background',
  'border',
  'borderRadius',
  'font',
  'lineHeight',
  'textAlign',
  'zIndex',
];

function code(text: string): string {
  return inlineCode(redact(text));
}

function block(text: string, info = ''): string {
  return fence(redact(text), info);
}

function item(label: string, value: string | null): string[] {
  return value === null ? [] : [`- ${label}: ${value}`];
}

function list(items: string[], separator: string): string | null {
  return items.length === 0 ? null : items.map(code).join(separator);
}

function pageSection(c: Capture): string[] {
  const { url, title, viewport, scroll, devicePixelRatio } = c.page;
  return [
    '## Page',
    '',
    `- URL: ${code(url)}`,
    `- Title: ${code(title)}`,
    `- Viewport: ${viewport.width}x${viewport.height} at ${devicePixelRatio}x, scrolled to ${scroll.x},${scroll.y}`,
  ];
}

function elementSection(c: Capture): string[] {
  const { target, a11y, framework } = c;
  const components = framework?.components ?? [];
  const { x, y, width, height } = target.rect;
  return [
    '## Element',
    '',
    `- Components: ${components.length === 0 ? 'none detected' : code(components.join(' > '))}`,
    ...item('Source', framework?.sourceFile ? code(framework.sourceFile) : null),
    `- Selector: ${code(target.selector)}`,
    `- Readable path: ${code(target.readablePath)}`,
    `- DOM path: ${code(target.domPath)}`,
    ...item('Classes', list(target.classes, ', ')),
    ...item('Role', a11y.role === null ? null : code(a11y.role)),
    ...item('Accessible name', a11y.name === null ? null : code(a11y.name)),
    `- Box: x ${x}, y ${y}, ${width}x${height}`,
  ];
}

function textSection(c: Capture): string[] {
  const { visibleText, selectedText } = c.target;
  const selected = selectedText === '' ? [] : ['', 'Selected text:', '', block(selectedText)];
  return ['## Text', '', 'Visible text:', '', block(visibleText), ...selected];
}

function nearbySection(c: Capture): string[] {
  const { ancestors, elements, text } = c.nearby;
  const lines = [
    ...item('Ancestors', list(ancestors, ' > ')),
    ...item('Elements', list(elements, ', ')),
  ];
  const parts = [lines.join('\n'), text.length === 0 ? '' : block(text.join('\n'))];
  return ['## Nearby', ...parts.filter((part) => part !== '').flatMap((part) => ['', part])];
}

export function elementSections(capture: Capture): string {
  return [
    pageSection(capture),
    elementSection(capture),
    textSection(capture),
    ['## HTML', '', block(capture.html, 'html')],
    ['## Styles', '', ...STYLE_KEYS.map((key) => `- ${key}: ${code(capture.styles[key])}`)],
    nearbySection(capture),
  ]
    .map((lines) => lines.join('\n'))
    .join('\n\n');
}
