import type { FrameworkInfo } from '../capture/types';
import { angularComponents } from './angular';
import { reactComponents } from './react';

const MARKER = 'data-herdrop-inspect';
const GUARD = 'data-herdrop-inspector';
const NONCE = /^[0-9a-f-]{36}$/;

type Message = Record<string, unknown>;

function asMessage(data: unknown): Message | null {
  return typeof data === 'object' && data !== null ? (data as Message) : null;
}

function validFramework(value: unknown): FrameworkInfo | null {
  const info = asMessage(value);
  if (!info) return null;
  const { kind, components, sourceFile } = info;
  if (kind !== 'react' && kind !== 'angular') return null;
  if (!Array.isArray(components) || !components.every((c) => typeof c === 'string')) return null;
  if (sourceFile !== null && typeof sourceFile !== 'string') return null;
  return { kind, components: [...components], sourceFile };
}

function requestNonce(data: unknown): string | null {
  const message = asMessage(data);
  if (message?.source !== 'herdrop-isolated' || message.type !== 'inspect') return null;
  return typeof message.nonce === 'string' && NONCE.test(message.nonce) ? message.nonce : null;
}

export function requestFramework(el: Element, timeoutMs = 150): Promise<FrameworkInfo | null> {
  const nonce = crypto.randomUUID();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (framework: FrameworkInfo | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      el.removeAttribute(MARKER);
      resolve(framework);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const message = asMessage(event.data);
      if (message?.source !== 'herdrop-main' || message.type !== 'inspected') return;
      if (message.nonce !== nonce) return;
      finish(validFramework(message.framework));
    };
    try {
      el.setAttribute(MARKER, nonce);
      window.addEventListener('message', onMessage);
      timer = setTimeout(() => finish(null), timeoutMs);
      window.postMessage(
        { source: 'herdrop-isolated', type: 'inspect', nonce },
        window.location.origin,
      );
    } catch {
      finish(null);
    }
  });
}

function inspect(win: Window, nonce: string): FrameworkInfo | null {
  try {
    const el = win.document.querySelector(`[${MARKER}="${nonce}"]`);
    if (!el) return null;
    el.removeAttribute(MARKER);
    return reactComponents(el) ?? angularComponents(el, (win as { ng?: unknown }).ng);
  } catch {
    return null;
  }
}

export function serveInspector(win: Window): void {
  const root = win.document.documentElement;
  if (root.hasAttribute(GUARD)) return;
  root.setAttribute(GUARD, '');
  win.addEventListener('message', (event) => {
    if (event.source !== win) return;
    const nonce = requestNonce(event.data);
    if (nonce === null) return;
    win.postMessage(
      { source: 'herdrop-main', type: 'inspected', nonce, framework: inspect(win, nonce) },
      win.location.origin,
    );
  });
}
