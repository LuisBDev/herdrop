import { AccessBanner } from './AccessBanner.tsx';
import { AnnotationsStage } from './annotations/AnnotationsStage.tsx';
import { DeliverStage } from './deliver/DeliverStage.tsx';
import { DestinationStage } from './destination/DestinationStage.tsx';
import { Header } from './Header.tsx';
import { createPanelState, PanelContext } from './state.ts';
import { Toast } from './Toast.tsx';
import type { startPanelTheme } from './theme.ts';

export function App(props: { theme: ReturnType<typeof startPanelTheme> }) {
  const state = createPanelState();

  return (
    <PanelContext.Provider value={state}>
      <div class="flex h-dvh flex-col">
        <Header theme={props.theme} />
        <AccessBanner />
        <ol aria-label="Drop progress" class="flex min-h-0 flex-1 list-none flex-col px-4 pt-1">
          <DestinationStage />
          <AnnotationsStage />
          <DeliverStage />
        </ol>
        <Toast />
        <p class="sr-only" role="status" aria-live="polite">
          {state.feedback.live()}
        </p>
      </div>
    </PanelContext.Provider>
  );
}
