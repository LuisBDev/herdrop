import { Info } from 'lucide-solid';
import { Tooltip } from './tooltip';

export function InfoTip(props: { label: string; text: string }) {
  return (
    <Tooltip content={props.text} wrap>
      <button
        type="button"
        aria-label={props.label}
        class="inline-flex size-6 cursor-help items-center justify-center rounded-sm text-ink-subtle hover:bg-surface-3 hover:text-ink"
      >
        <Info size={16} />
      </button>
    </Tooltip>
  );
}
