function longestRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

export function fence(text: string, info = ''): string {
  const f = '`'.repeat(Math.max(3, longestRun(text) + 1));
  return `${f}${info}\n${text}\n${f}`;
}

export function inlineCode(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return '(empty)';
  const run = '`'.repeat(longestRun(flat) + 1);
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${run}${pad}${flat}${pad}${run}`;
}

export function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}
