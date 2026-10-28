import { describe, expect, it } from 'vitest';
import type { Capture } from '../../capture/types.ts';
import { initialDraft } from '../../draft/machine.ts';
import type { Annotation, Destination, Draft, Intent } from '../../draft/model.ts';
import { annotationsView, undoView } from './annotations-view.ts';

const destination: Destination = {
  machine: 'local',
  machineLabel: 'local',
  local: true,
  paneId: 'p1',
  name: 'claude',
  kind: 'claude',
  folder: 'D:/app',
  folderKind: 'cwd',
  status: 'idle',
};

function note(
  id: string,
  url: string,
  comment = 'make it bigger',
  intent: Intent = 'change',
): Annotation {
  const capture = {
    page: { url },
    target: { tag: 'button', classes: [] },
    a11y: { role: null, name: null },
    framework: null,
  } as unknown as Capture;
  return { id, intent, priority: null, comment, capture, createdAt: 0 };
}

function drafting(annotations: Annotation[]): Extract<Draft, { phase: 'drafting' }> {
  return { phase: 'drafting', destination, annotations, undo: null, lastDelivery: null };
}

const A = 'http://localhost:4200/invoices';
const B = 'http://localhost:4200/settings';

describe('annotationsView', () => {
  it('groups_in_first_appearance_order_with_positions_after_delete', () => {
    const draft = drafting([note('a', A), note('c', B), note('d', A)]);
    const view = annotationsView(draft, A, new Set());
    expect(view.groups.map((g) => g.page)).toEqual([
      'localhost:4200/invoices',
      'localhost:4200/settings',
    ]);
    expect(view.groups[0]?.label).toBe('Annotations on localhost:4200/invoices');
    expect(view.groups[0]?.items.map((i) => [i.id, i.number])).toEqual([
      ['a', 1],
      ['d', 3],
    ]);
    expect(view.groups[1]?.items.map((i) => [i.id, i.number])).toEqual([['c', 2]]);
  });

  it('other_page_and_offscreen_flags', () => {
    const draft = drafting([note('a', A), note('b', B)]);
    const offscreen = new Set(['a', 'b']);
    const cases = [
      {
        target: 'http://localhost:4200/invoices?x=1#y',
        id: 'a',
        otherPage: false,
        offScreen: true,
        editable: true,
        tip: 'Edit on the page',
      },
      {
        target: 'http://localhost:4200/invoices',
        id: 'b',
        otherPage: true,
        offScreen: false,
        editable: false,
        tip: 'Open localhost:4200/settings to edit',
      },
      {
        target: null,
        id: 'a',
        otherPage: true,
        offScreen: false,
        editable: false,
        tip: 'Open localhost:4200/invoices to edit',
      },
    ];
    for (const c of cases) {
      const item = annotationsView(draft, c.target, offscreen)
        .groups.flatMap((g) => g.items)
        .find((i) => i.id === c.id);
      expect(item).toMatchObject({
        otherPage: c.otherPage,
        offScreen: c.offScreen,
        editable: c.editable,
        editTip: c.tip,
      });
    }
  });

  it('count_and_comment_fallbacks', () => {
    expect(annotationsView(initialDraft, A, new Set()).count).toBe('');
    expect(annotationsView(drafting([]), A, new Set()).count).toBe('Empty');
    expect(annotationsView(drafting([note('a', A), note('b', A)]), A, new Set()).count).toBe('2');
    const approve = drafting([note('a', A, '', 'approve')]);
    const item = annotationsView(approve, A, new Set()).groups[0]?.items[0];
    expect(item?.comment).toBe('No comment');
    expect(item?.what).toBe('No component detected');
  });
});

describe('undoView', () => {
  it('undo_text_uses_original_position', () => {
    const draft: Draft = { ...drafting([]), undo: { annotation: note('x', A), index: 1 } };
    expect(undoView(draft)).toEqual({ id: 'x', text: 'Annotation 2 deleted' });
    expect(undoView(drafting([]))).toBeNull();
  });
});
