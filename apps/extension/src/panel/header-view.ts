import type { Draft } from '../draft/model.ts';
import type { SiteAccess } from './state.ts';

export type HeaderInput = {
  phase: Draft['phase'];
  hasDestination: boolean;
  access: SiteAccess;
  selectOn: boolean;
  grabArmed: boolean;
  pending: boolean;
};

export type HeaderView = {
  grab: { unavailable: boolean; pressed: boolean; tip: string };
  select: { unavailable: boolean; pressed: boolean; label: 'Select' | 'Selecting'; tip: string };
};

function accessTip(access: SiteAccess): string | null {
  if (access === 'not_web') return 'Herdrop works on http and https pages';
  if (access === 'missing') return 'Allow access to this site first';
  return null;
}

function grabTip(input: HeaderInput): string {
  const blocked = accessTip(input.access);
  if (blocked !== null) return blocked;
  if (input.pending) return 'Finish or cancel the open note first';
  return 'Copy an element’s context (Alt+Shift+G)';
}

function selectTip(input: HeaderInput): string {
  const blocked = accessTip(input.access);
  if (blocked !== null) return blocked;
  if (!input.hasDestination) return 'Choose a destination first';
  if (input.phase === 'drafting') return 'Annotate elements (Alt+Shift+H)';
  return 'Paused while the drop runs';
}

export function headerView(input: HeaderInput): HeaderView {
  const granted = input.access === 'granted';
  const grabUnavailable = !granted || input.pending;
  const selectUnavailable = !granted || !input.hasDestination || input.phase !== 'drafting';
  const selectPressed = input.selectOn && !input.grabArmed && !selectUnavailable;
  return {
    grab: {
      unavailable: grabUnavailable,
      pressed: input.grabArmed && !grabUnavailable,
      tip: grabTip(input),
    },
    select: {
      unavailable: selectUnavailable,
      pressed: selectPressed,
      label: selectPressed ? 'Selecting' : 'Select',
      tip: selectTip(input),
    },
  };
}

export function accessBannerView(
  targetUrl: string,
  access: SiteAccess,
): { show: boolean; host: string } {
  return { show: access === 'missing', host: new URL(targetUrl).host };
}
