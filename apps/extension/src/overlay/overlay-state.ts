import { type Accessor, createContext, createSignal, useContext } from 'solid-js';
import type { PageState, PanelProtocol } from '../messaging/types.ts';

export type OverlayMode = 'off' | 'select' | 'grab';

export type OverlayState = {
  page: Accessor<PageState>;
  mode: Accessor<OverlayMode>;
  grabArmed: Accessor<boolean>;
  noteOpen: Accessor<boolean>;
  setNoteOpen(open: boolean): void;
  linkedId: Accessor<string | null>;
  setLinked(id: string | null, notifyPanel: boolean): void;
  applyPageState(state: PageState): void;
  refresh(): Promise<void>;
  armGrab(): void;
  disarmGrab(): void;
  pick(el: Element, mode: 'select' | 'grab'): void;
  onPick(mode: 'select' | 'grab', handler: (el: Element) => void): () => void;
  live: Accessor<string>;
  announce(text: string): void;
};

export type OverlayDeps = {
  getPageState: (url: string) => Promise<PageState>;
  notifyPanel: <K extends keyof PanelProtocol>(
    type: K,
    data: Parameters<PanelProtocol[K]>[0],
  ) => Promise<void>;
  url: () => string;
};

const INITIAL_PAGE: PageState = {
  selectOn: false,
  canSelect: false,
  nextNumber: 1,
  annotations: [],
  pending: null,
  pendingElsewhere: false,
};

export function createOverlayState(deps: OverlayDeps): OverlayState {
  const [page, setPage] = createSignal<PageState>(INITIAL_PAGE);
  const [grabArmed, setGrabArmed] = createSignal(false);
  const [noteOpen, setNoteOpenSignal] = createSignal(false);
  const [linkedId, setLinkedId] = createSignal<string | null>(null);
  const [live, setLive] = createSignal('');
  const handlers: Record<'select' | 'grab', Set<(el: Element) => void>> = {
    select: new Set(),
    grab: new Set(),
  };

  const mode = (): OverlayMode => {
    if (noteOpen() || page().pendingElsewhere) return 'off';
    if (grabArmed()) return 'grab';
    if (page().selectOn && page().canSelect) return 'select';
    return 'off';
  };

  return {
    page,
    mode,
    grabArmed,
    noteOpen,
    setNoteOpen: setNoteOpenSignal,
    linkedId,
    setLinked(id, notifyPanel) {
      setLinkedId(id);
      if (notifyPanel) void deps.notifyPanel('annotationLinked', { id });
    },
    applyPageState: setPage,
    async refresh() {
      setPage(await deps.getPageState(deps.url()));
    },
    armGrab() {
      if (noteOpen() || page().pendingElsewhere) return;
      setGrabArmed(true);
      void deps.notifyPanel('grabChanged', { armed: true });
    },
    disarmGrab() {
      setGrabArmed(false);
      void deps.notifyPanel('grabChanged', { armed: false });
    },
    pick(el, pickMode) {
      for (const handler of handlers[pickMode]) handler(el);
    },
    onPick(pickMode, handler) {
      handlers[pickMode].add(handler);
      return () => {
        handlers[pickMode].delete(handler);
      };
    },
    live,
    announce(text) {
      if (live() === text) {
        setLive('');
        queueMicrotask(() => setLive(text));
        return;
      }
      setLive(text);
    },
  };
}

export const OverlayContext = createContext<OverlayState>();

export function useOverlay(): OverlayState {
  const state = useContext(OverlayContext);
  if (!state) throw new Error('useOverlay must be used inside OverlayContext.Provider');
  return state;
}
