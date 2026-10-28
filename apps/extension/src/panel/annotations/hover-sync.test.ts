import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { TargetTab } from '../../messaging/types.ts';
import { createHoverSync } from './hover-sync.ts';

vi.mock('solid-js', () => import('solid-js/dist/solid.js' as string));

type Sender = { tab?: { id?: number } };
type Handler<T> = (msg: { data: T; sender: Sender }) => void;

const TARGET = 7;
const OTHER = 9;
const PAGE = 'http://localhost:4200/';

function setup() {
  const sent: Array<[string, unknown]> = [];
  let linked: Handler<{ id: string | null }> = () => undefined;
  let visibility: Handler<{ url: string; offscreen: string[] }> = () => undefined;
  const [targetTab, setTargetTab] = createSignal<TargetTab | null>({ id: TARGET, url: PAGE });
  const sync = createRoot(() =>
    createHoverSync({
      sendToTab: async (type, data) => {
        sent.push([type, data]);
      },
      targetTab,
      onLinked: (handler) => {
        linked = handler;
        return () => undefined;
      },
      onOffscreen: (handler) => {
        visibility = handler;
        return () => undefined;
      },
    }),
  );
  return {
    sync,
    sent,
    setTargetTab,
    linked: (id: string | null, tabId: number) =>
      linked({ data: { id }, sender: { tab: { id: tabId } } }),
    visibility: (offscreen: string[], tabId: number, url = PAGE) =>
      visibility({
        data: { url, offscreen },
        sender: { tab: { id: tabId } },
      }),
  };
}

it('enter_and_leave_highlight_on_target_tab', () => {
  const { sync, sent } = setup();
  sync.enter('a1');
  expect(sync.linkedId()).toBe('a1');
  expect(sync.linkedFromPage()).toBe(false);
  sync.leave();
  expect(sync.linkedId()).toBeNull();
  expect(sent).toEqual([
    ['highlightAnnotation', { id: 'a1' }],
    ['highlightAnnotation', { id: null }],
  ]);
});

it('messages_from_other_tabs_are_ignored', () => {
  const { sync, linked, visibility } = setup();
  linked('a1', OTHER);
  visibility(['a2'], OTHER);
  expect(sync.linkedId()).toBeNull();
  expect([...sync.offscreen()]).toEqual([]);
  visibility(['a2'], TARGET);
  expect([...sync.offscreen()]).toEqual(['a2']);
});

it('linked_from_target_tab_sets_id_and_marks_page_source', () => {
  const { sync, linked } = setup();
  linked('a3', TARGET);
  expect(sync.linkedId()).toBe('a3');
  expect(sync.linkedFromPage()).toBe(true);
  linked(null, TARGET);
  expect(sync.linkedId()).toBeNull();
});

it('target_tab_change_resets_state_and_other_page_reports_are_ignored', () => {
  const { sync, linked, visibility, setTargetTab } = setup();
  linked('a1', TARGET);
  visibility(['a2'], TARGET);
  setTargetTab({ id: OTHER, url: 'http://localhost:4200/cart?step=2' });
  expect(sync.linkedId()).toBeNull();
  expect(sync.linkedFromPage()).toBe(false);
  expect([...sync.offscreen()]).toEqual([]);
  visibility(['a3'], OTHER, PAGE);
  expect([...sync.offscreen()]).toEqual([]);
  visibility(['a4'], OTHER, 'http://localhost:4200/cart#top');
  expect([...sync.offscreen()]).toEqual(['a4']);
});
