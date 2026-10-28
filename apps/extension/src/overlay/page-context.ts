import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export type PageContext = Pick<ContentScriptContext, 'addEventListener' | 'requestAnimationFrame'>;
