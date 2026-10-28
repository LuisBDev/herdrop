import { createEffect, createSignal, Index, on, onCleanup, onMount, Show } from 'solid-js';
import { layoutMarkers, locate, type Marker } from './locate.ts';
import type { NoteController } from './note-controller.ts';
import { useOverlay } from './overlay-state.ts';
import { boxRect } from './selection.ts';
import type { VisibilityReporter } from './visibility.ts';

export function Markers(props: { controller: NoteController; reporter: VisibilityReporter }) {
  const state = useOverlay();
  const [markers, setMarkers] = createSignal<Marker[]>([]);
  const [tick, setTick] = createSignal(0);
  let frame = 0;

  const editingId = () => {
    const s = props.controller.session();
    return s?.note.mode === 'edit' ? s.note.annotationId : null;
  };

  const recompute = () => {
    const { markers: next, offscreen } = layoutMarkers(
      state.page().annotations,
      locate,
      { width: window.innerWidth, height: window.innerHeight },
      editingId(),
    );
    setMarkers(next);
    setTick((n) => n + 1);
    props.reporter.update(offscreen);
  };

  const schedule = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      recompute();
    });
  };

  createEffect(on([() => state.page().annotations, editingId], schedule));

  onMount(() => {
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true });
    onCleanup(() => {
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    });
  });

  const linkBox = () => {
    tick();
    const id = state.linkedId();
    if (id === null) return null;
    const a = state.page().annotations.find((x) => x.id === id);
    const el = a ? locate(a.selector) : null;
    if (!el || el === props.controller.session()?.target) return null;
    return boxRect(el.getBoundingClientRect());
  };

  return (
    <>
      <Show when={linkBox()}>
        {(b) => (
          <div
            class="ov-box link"
            aria-hidden="true"
            style={{
              left: `${b().left}px`,
              top: `${b().top}px`,
              width: `${b().width}px`,
              height: `${b().height}px`,
            }}
          />
        )}
      </Show>
      <Index each={markers()}>
        {(m) => (
          <button
            type="button"
            class="marker"
            classList={{ linked: state.linkedId() === m().id }}
            aria-label={`Annotation ${m().number}, ${m().intent}. Edit`}
            style={{ left: `${m().left}px`, top: `${m().top}px` }}
            onClick={() => props.controller.openEdit(m().id)}
            onMouseEnter={() => state.setLinked(m().id, true)}
            onFocus={() => state.setLinked(m().id, true)}
            onMouseLeave={() => state.setLinked(null, true)}
            onBlur={() => state.setLinked(null, true)}
          >
            {m().number}
          </button>
        )}
      </Index>
    </>
  );
}
