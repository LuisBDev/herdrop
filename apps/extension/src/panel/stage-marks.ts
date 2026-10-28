import type { Draft } from '../draft/model.ts';

export type StageMark = {
  mark: 'cur' | 'done' | 'fail' | 'todo';
  current: boolean;
  grow: boolean;
  muted: boolean;
};

export function stageMarks(draft: Draft): {
  destination: StageMark;
  annotations: StageMark;
  deliver: StageMark;
} {
  const hasDest = draft.phase !== 'no_destination';
  const locked = draft.phase === 'sending' || draft.phase === 'failed';
  const open = hasDest && !locked;
  return {
    destination: {
      mark: hasDest ? 'done' : 'cur',
      current: !hasDest,
      grow: !hasDest,
      muted: false,
    },
    annotations: {
      mark: !hasDest ? 'todo' : locked ? 'done' : 'cur',
      current: open,
      grow: open,
      muted: !hasDest,
    },
    deliver: {
      mark: draft.phase === 'failed' ? 'fail' : draft.phase === 'sending' ? 'cur' : 'todo',
      current: locked,
      grow: false,
      muted: !hasDest,
    },
  };
}
