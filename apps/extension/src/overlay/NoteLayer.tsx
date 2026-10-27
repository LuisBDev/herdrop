import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { NoteBox } from './NoteBox.tsx';
import { NotePill } from './NotePill.tsx';
import type { NoteController } from './note-controller.ts';
import { pillState } from './note-state.ts';
import { useOverlay } from './overlay-state.ts';
import { clamp, type Size } from './placement.ts';
import { boxRect } from './selection.ts';

const PILL_SIZE: Size = { w: 160, h: 36 };

export function NoteLayer(props: { controller: NoteController }) {
  const state = useOverlay();
  const [rect, setRect] = createSignal<DOMRect | null>(null);
  const [pillSize, setPillSize] = createSignal<Size>(PILL_SIZE);
  let frame = 0;

  const target = () => props.controller.session()?.target ?? null;
  const read = () => setRect(target()?.getBoundingClientRect() ?? null);

  const schedule = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      read();
    });
  };

  createEffect(() => {
    target();
    read();
  });

  onMount(() => {
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    onCleanup(() => {
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    });
  });

  const measure = (el: HTMLButtonElement) => {
    const r = el.getBoundingClientRect();
    setPillSize({ w: r.width, h: r.height });
  };

  return (
    <Show when={props.controller.session()}>
      {(session) => {
        const box = () => {
          const r = rect();
          return r ? boxRect(r) : null;
        };
        const linked = () =>
          session().note.mode === 'edit' && state.linkedId() === session().note.annotationId;
        const pillPos = () => {
          const pos = session().pos;
          if (!pos) return null;
          return clamp(pos, pillSize(), { width: window.innerWidth, height: window.innerHeight });
        };
        return (
          <>
            <Show when={box()}>
              {(b) => (
                <>
                  <div
                    class="ov-box fixed"
                    aria-hidden="true"
                    style={{
                      left: `${b().left}px`,
                      top: `${b().top}px`,
                      width: `${b().width}px`,
                      height: `${b().height}px`,
                    }}
                  />
                  <span
                    class="marker pending"
                    aria-hidden="true"
                    style={{ left: `${b().left + 3}px`, top: `${b().top + 3}px` }}
                  >
                    {session().number}
                  </span>
                </>
              )}
            </Show>
            <Show when={session().pos}>
              {(pos) => (
                <Show
                  when={!session().note.minimized}
                  fallback={
                    <Show when={pillPos()}>
                      {(p) => (
                        <NotePill
                          number={session().number}
                          intent={session().note.intent}
                          state={pillState(session().note)}
                          pos={p()}
                          linked={linked()}
                          measureRef={measure}
                          onRestore={() => props.controller.restore()}
                          onHover={(on) => props.controller.hover(on)}
                        />
                      )}
                    </Show>
                  }
                >
                  <NoteBox
                    note={session().note}
                    number={session().number}
                    heading={session().heading}
                    pos={pos()}
                    linked={linked()}
                    onChange={(p) => props.controller.change(p)}
                    onMove={(p) => props.controller.move(p)}
                    onSave={() => void props.controller.save()}
                    onCancel={() => props.controller.cancel()}
                    onDelete={() => void props.controller.remove()}
                    onMinimize={() => props.controller.minimize()}
                    onHover={(on) => props.controller.hover(on)}
                  />
                </Show>
              )}
            </Show>
          </>
        );
      }}
    </Show>
  );
}
