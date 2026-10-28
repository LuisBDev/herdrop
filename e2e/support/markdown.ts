const OPEN_FENCE = /^ {0,3}(`{3,})[^`]*$/;
const CLOSE_FENCE = /^ {0,3}(`{3,})[ \t]*$/;

function closingRun(text: string, from: number, length: number): number {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let match = runs.exec(text); match !== null; match = runs.exec(text)) {
    if (match[0].length === length) return match.index;
  }
  return -1;
}

function withoutSpans(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      out += text[i];
      i += 1;
      continue;
    }
    let length = 0;
    while (text[i + length] === '`') length += 1;
    const close = closingRun(text, i + length, length);
    if (close === -1) {
      out += text.slice(i, i + length);
      i += length;
    } else {
      i = close + length;
    }
  }
  return out;
}

function fenceEnd(lines: string[], start: number, length: number): number {
  for (let j = start + 1; j < lines.length; j += 1) {
    const run = CLOSE_FENCE.exec(lines[j] ?? '')?.[1];
    if (run !== undefined && run.length >= length) return j;
  }
  return -1;
}

export function outsideCode(md: string): string {
  const lines = md.split('\n');
  const segments: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) segments.push(withoutSpans(current.join('\n')));
    current = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const open = OPEN_FENCE.exec(line)?.[1];
    const end = open === undefined ? -1 : fenceEnd(lines, i, open.length);
    if (end === -1) {
      current.push(line);
      continue;
    }
    flush();
    i = end;
  }
  flush();
  return segments.join('\n');
}
