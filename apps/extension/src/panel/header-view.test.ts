import { describe, expect, it } from 'vitest';
import { accessBannerView, type HeaderInput, headerView } from './header-view.ts';

const base: HeaderInput = {
  phase: 'drafting',
  hasDestination: true,
  access: 'granted',
  selectOn: true,
  grabArmed: false,
  pending: false,
};

const NOT_WEB = 'Herdrop works on http and https pages';
const MISSING = 'Allow access to this site first';

describe('headerView', () => {
  it.each<[Partial<HeaderInput>, ReturnType<typeof headerView>]>([
    [
      { access: 'not_web', pending: true, grabArmed: true, phase: 'no_destination' },
      {
        grab: { unavailable: true, pressed: false, tip: NOT_WEB },
        select: { unavailable: true, pressed: false, label: 'Select', tip: NOT_WEB },
      },
    ],
    [
      { access: 'missing', pending: true, hasDestination: false },
      {
        grab: { unavailable: true, pressed: false, tip: MISSING },
        select: { unavailable: true, pressed: false, label: 'Select', tip: MISSING },
      },
    ],
    [
      { pending: true, hasDestination: false, phase: 'no_destination' },
      {
        grab: { unavailable: true, pressed: false, tip: 'Finish or cancel the open note first' },
        select: {
          unavailable: true,
          pressed: false,
          label: 'Select',
          tip: 'Choose a destination first',
        },
      },
    ],
    [
      {},
      {
        grab: {
          unavailable: false,
          pressed: false,
          tip: 'Copy an element’s context (Alt+Shift+G)',
        },
        select: {
          unavailable: false,
          pressed: true,
          label: 'Selecting',
          tip: 'Annotate elements (Alt+Shift+H)',
        },
      },
    ],
    [
      { phase: 'sending' },
      {
        grab: {
          unavailable: false,
          pressed: false,
          tip: 'Copy an element’s context (Alt+Shift+G)',
        },
        select: {
          unavailable: true,
          pressed: false,
          label: 'Select',
          tip: 'Paused while the drop runs',
        },
      },
    ],
  ])('header_tips_in_priority_order %#', (input, expected) => {
    expect(headerView({ ...base, ...input })).toEqual(expected);
  });

  it('select_not_pressed_while_grab_armed', () => {
    const view = headerView({ ...base, grabArmed: true });
    expect(view.grab.pressed).toBe(true);
    expect(view.select).toMatchObject({ pressed: false, label: 'Select', unavailable: false });
  });
});

describe('accessBannerView', () => {
  it('banner_shows_host_with_port_only_when_missing', () => {
    const url = 'http://localhost:4200/invoices';
    expect(accessBannerView(url, 'missing')).toEqual({ show: true, host: 'localhost:4200' });
    expect(accessBannerView(url, 'not_web').show).toBe(false);
  });
});
