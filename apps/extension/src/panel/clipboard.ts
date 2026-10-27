export type ClipboardEnv = {
  clipboard: Pick<Clipboard, 'writeText'>;
  doc: Document;
};

function copyWithTextarea(text: string, doc: Document): boolean {
  const area = doc.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.append(area);
  try {
    area.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export async function copyText(
  text: string,
  env: ClipboardEnv = { clipboard: navigator.clipboard, doc: document },
): Promise<boolean> {
  try {
    await env.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithTextarea(text, env.doc);
  }
}
