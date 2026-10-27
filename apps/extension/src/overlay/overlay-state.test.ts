import { describe, expect, it, vi } from 'vitest';
import type { PageState } from '../messaging/types.ts';
import { createOverlayState } from './overlay-state.ts';

const base: PageState = {
  selectOn: false,
  canSelect: false,
  nextNumber: 1,
  annotations: [],
  pending: null,
  pendingElsewhere: false,
};

function setup() {
  const notifyPanel = vi.fn(async () => {});
  const state = createOverlayState({
    getPageState: async () => base,
    notifyPanel,
    url: () => 'https://example.com/',
  });
  return { state, notifyPanel };
}

describe('overlay state', () => {
  it('mode_precedence', () => {
    const cases: [Partial<PageState>, { noteOpen?: boolean; grab?: boolean }, string][] = [
      [{ selectOn: true, canSelect: true }, { noteOpen: true }, 'off'],
      [{ selectOn: true, canSelect: true, pendingElsewhere: true }, {}, 'off'],
      [{ selectOn: true, canSelect: true }, { grab: true }, 'grab'],
      [{ selectOn: true, canSelect: false }, {}, 'off'],
      [{ selectOn: true, canSelect: true }, {}, 'select'],
    ];
    for (const [page, flags, expected] of cases) {
      const { state } = setup();
      state.applyPageState({ ...base, ...page });
      if (flags.grab) state.armGrab();
      if (flags.noteOpen) state.setNoteOpen(true);
      expect(state.mode()).toBe(expected);
    }
  });

  it('arm_grab_ignored_while_a_note_is_pending', () => {
    const open = setup();
    open.state.setNoteOpen(true);
    open.state.armGrab();
    expect(open.state.grabArmed()).toBe(false);
    expect(open.notifyPanel).not.toHaveBeenCalled();

    const elsewhere = setup();
    elsewhere.state.applyPageState({ ...base, pendingElsewhere: true });
    elsewhere.state.armGrab();
    expect(elsewhere.state.grabArmed()).toBe(false);
    expect(elsewhere.notifyPanel).not.toHaveBeenCalled();
  });

  it('arm_and_disarm_send_grab_changed', () => {
    const { state, notifyPanel } = setup();
    state.armGrab();
    expect(state.grabArmed()).toBe(true);
    expect(notifyPanel).toHaveBeenLastCalledWith('grabChanged', { armed: true });
    state.disarmGrab();
    expect(state.grabArmed()).toBe(false);
    expect(notifyPanel).toHaveBeenLastCalledWith('grabChanged', { armed: false });
  });

  it('set_linked_notifies_only_when_asked', () => {
    const { state, notifyPanel } = setup();
    state.setLinked('a1', false);
    expect(state.linkedId()).toBe('a1');
    expect(notifyPanel).not.toHaveBeenCalled();
    state.setLinked(null, true);
    expect(state.linkedId()).toBeNull();
    expect(notifyPanel).toHaveBeenCalledWith('annotationLinked', { id: null });
  });
});
