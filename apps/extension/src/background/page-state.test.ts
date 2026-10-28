import { describe, expect, it } from 'vitest';
import type { Capture } from '../capture/types.ts';
import type { Annotation, Draft } from '../draft/model.ts';
import type { PendingNoteInput, UiState } from '../messaging/types.ts';
import { pageStateFor } from './page-state.ts';

function capture(
  url: string,
  tag: string,
  classes: string[],
  name: string | null,
  components: string[] | null,
): Capture {
  return {
    page: {
      url,
      title: 'Dashboard',
      viewport: { width: 1280, height: 800 },
      scroll: { x: 0, y: 0 },
      devicePixelRatio: 1,
    },
    target: {
      tag,
      selector: `main > ${[tag, ...classes].join('.')}`,
      readablePath: tag,
      domPath: tag,
      classes,
      selectedText: '',
      visibleText: name ?? '',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    },
    html: `<${tag}></${tag}>`,
    a11y: { role: null, name },
    styles: {} as Capture['styles'],
    nearby: { text: [], elements: [], ancestors: [] },
    framework: components ? { kind: 'angular', components, sourceFile: null } : null,
  };
}

const dashboard = 'http://localhost:4200/dashboard';

const annotations: Annotation[] = [
  {
    id: 'a1',
    intent: 'fix',
    priority: null,
    comment: 'Align the title',
    capture: capture(dashboard, 'h1', [], 'Invoices', null),
    createdAt: 1,
  },
  {
    id: 'a2',
    intent: 'question',
    priority: null,
    comment: 'Why two buttons?',
    capture: capture('http://localhost:4200/settings', 'button', [], 'Save', null),
    createdAt: 2,
  },
  {
    id: 'a3',
    intent: 'change',
    priority: 'important',
    comment: 'Show the total with cents',
    capture: capture(dashboard, 'p', ['stat-value'], '$6,940.00', [
      'AppComponent',
      'StatCardComponent',
    ]),
    createdAt: 3,
  },
];

const draft: Draft = {
  phase: 'drafting',
  destination: {
    machine: 'local',
    machineLabel: 'local',
    local: true,
    paneId: 'p1',
    name: 'claude',
    kind: 'claude',
    folder: 'D:/app',
    folderKind: 'cwd',
    status: 'idle',
  },
  annotations,
  undo: null,
  lastDelivery: null,
};

const input: PendingNoteInput = {
  annotationId: null,
  number: 4,
  intent: 'change',
  state: 'unsaved',
  minimized: false,
};

const ui: UiState = { selectOn: true, pending: { ...input, tabId: 1, url: dashboard } };

describe('pageStateFor', () => {
  it('page_state_for_table', () => {
    const own = pageStateFor({ id: 1, url: `${dashboard}?tab=2#stats` }, draft, ui);
    expect(own.annotations.map((a) => [a.id, a.number])).toEqual([
      ['a1', 1],
      ['a3', 3],
    ]);
    expect(own.annotations[1]).toEqual({
      id: 'a3',
      number: 3,
      intent: 'change',
      priority: 'important',
      comment: 'Show the total with cents',
      selector: 'main > p.stat-value',
      component: 'StatCardComponent',
      elementTag: 'p.stat-value',
      elementLabel: 'p.stat-value “$6,940.00”',
    });
    expect(own).toMatchObject({
      selectOn: true,
      canSelect: true,
      nextNumber: 4,
      pendingElsewhere: false,
    });
    expect(own.pending).toEqual(input);

    const other = pageStateFor({ id: 2, url: 'http://localhost:4200/settings' }, draft, ui);
    expect(other.annotations.map((a) => [a.id, a.number])).toEqual([['a2', 2]]);
    expect(other).toMatchObject({ nextNumber: 4, pending: null, pendingElsewhere: true });

    const idle = pageStateFor({ id: 2, url: dashboard }, draft, { selectOn: false, pending: null });
    expect(idle).toMatchObject({ pending: null, pendingElsewhere: false });
  });
});
