export type ClipboardEnv = {
  clipboard: Pick<Clipboard, 'writeText'> | undefined;
  doc: Document;
};

function copyWithTextarea(text: string, container: HTMLElement, doc: Document): boolean {
  const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const area = doc.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  container.append(area);
  try {
    area.focus();
    area.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus();
  }
}

export async function copyText(
  text: string,
  container: HTMLElement = document.body,
  env: ClipboardEnv = { clipboard: navigator.clipboard as Clipboard | undefined, doc: document },
): Promise<boolean> {
  if (env.clipboard) {
    try {
      await env.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithTextarea(text, container, env.doc);
    }
  }
  return copyWithTextarea(text, container, env.doc);
}
