import { requestFramework } from '../inspector/channel';
import { captureElement } from './capture';
import type { Capture, FrameworkInfo } from './types';

export async function captureTarget(
  el: Element,
  selectedText: string,
  request: (el: Element) => Promise<FrameworkInfo | null> = requestFramework,
): Promise<Capture> {
  const framework = await request(el);
  return captureElement(el, { selectedText, framework });
}
