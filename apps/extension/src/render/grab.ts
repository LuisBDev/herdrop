import type { Capture } from '../capture/types.ts';
import { UNTRUSTED_LINE } from './label.ts';
import { elementSections } from './sections.ts';

export function renderGrab(capture: Capture): string {
  return ['# Element context', UNTRUSTED_LINE, elementSections(capture)].join('\n\n');
}
