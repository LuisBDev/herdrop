import { CircleCheck, X } from 'lucide-solid';
import { Button } from '../ui/button';
import { InfoTip } from '../ui/info-tip';
import type { deliveredView } from './deliver-view.ts';

export function DeliveredAlert(props: {
  view: ReturnType<typeof deliveredView>;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      class="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 rounded-lg border border-semantic-success-border bg-semantic-success-soft p-3"
    >
      <CircleCheck size={20} class="text-semantic-success" aria-hidden="true" />
      <div>
        <div class="flex items-start justify-between gap-2">
          <p class="m-0 text-sm font-semibold leading-[1.35]">{props.view.title}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            class="-mr-1.5 -mt-1.5"
            aria-label="Dismiss"
            onClick={props.onDismiss}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
        <p class="m-0 mt-0.5 flex items-center gap-1 font-mono text-xs text-ink-subtle">
          {props.view.dropId}
          <InfoTip label="Where the drop is" text={props.view.where} />
        </p>
      </div>
    </div>
  );
}
