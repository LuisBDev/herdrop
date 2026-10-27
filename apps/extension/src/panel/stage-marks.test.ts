import { describe, expect, it } from 'vitest';
import type { Draft } from '../draft/model.ts';
import { stageMarks } from './stage-marks.ts';

const mark = (
  m: 'cur' | 'done' | 'fail' | 'todo',
  current: boolean,
  grow: boolean,
  muted: boolean,
) => ({
  mark: m,
  current,
  grow,
  muted,
});

describe('stageMarks', () => {
  it.each([
    [
      'no_destination',
      mark('cur', true, true, false),
      mark('todo', false, false, true),
      mark('todo', false, false, true),
    ],
    [
      'drafting',
      mark('done', false, false, false),
      mark('cur', true, true, false),
      mark('todo', false, false, false),
    ],
    [
      'sending',
      mark('done', false, false, false),
      mark('done', false, false, false),
      mark('cur', true, false, false),
    ],
    [
      'failed',
      mark('done', false, false, false),
      mark('done', false, false, false),
      mark('fail', true, false, false),
    ],
  ] as const)('stage_marks_per_phase: %s', (phase, destination, annotations, deliver) => {
    expect(stageMarks({ phase } as Draft)).toEqual({ destination, annotations, deliver });
  });
});
