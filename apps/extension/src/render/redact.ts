const WORDS =
  'token|secret|password|passwd|csrf|xsrf|session_id|sessionid|api[_-]?key|auth[_-]?token';
const REDACTED = '[redacted]';

const PAIR = new RegExp(String.raw`(${WORDS})(["']?\s*[:=]\s*["']?)([^\s"'&<>]+)`, 'gi');
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const TAG = /<[a-z][^<>]*>/gi;
const WORD_TEST = new RegExp(WORDS, 'i');
const NAME_ATTR = /\bname\s*=\s*["']?([^\s"'>]+)/i;
const VALUE_ATTR = /(\bvalue\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i;
const SECRET_ATTR = new RegExp(
  String.raw`([\w:-]*(?:${WORDS})[\w:-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)`,
  'gi',
);

function redactTag(tag: string): string {
  let out = tag.replace(SECRET_ATTR, `$1$2"${REDACTED}"`);
  const named = NAME_ATTR.exec(out);
  if (named?.[1] && WORD_TEST.test(named[1])) {
    out = out.replace(VALUE_ATTR, `$1"${REDACTED}"`);
  }
  return out;
}

export function redact(text: string): string {
  return text.replace(TAG, redactTag).replace(PAIR, `$1$2${REDACTED}`).replace(JWT, REDACTED);
}
