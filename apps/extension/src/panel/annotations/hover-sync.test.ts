import { createSignal } from 'solid-js';
import { expect, it } from 'vitest';
import { createHoverSync } from './hover-sync.ts';

type Sender = { tab?: { id?: number } };
type Handler<T> = (msg: { data: T; sender: Sender }) => void;

const TARGET = 7;
const OTHER = 9;

function setup() {
  const sent: Array<[string, unknown]> = [];
  let linked: Handler<{ id: string | null }> = () => undefined;
  let visibility: Handler<{ url: string; offscreen: string[] }> = () => undefined;
  const [targetTabId] = createSignal<number | null>(TARGET);
  const sync = createHoverSync({
    sendToTab: async (type, data) => {
      sent.push([type, data]);
    },
    targetTabId,
    onLinked: (handler) => {
      linked = handler;
      return () => undefined;
    },
    onOffscreen: (handler) => {
      visibility = handler;
      return () => undefined;
    },
  });
  return {
    sync,
    sent,
    linked: (id: string | null, tabId: number) =>
      linked({ data: { id }, sender: { tab: { id: tabId } } }),
    visibility: (offscreen: string[], tabId: number) =>
      visibility({
        data: { url: 'http://localhost:4200/', offscreen },
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
