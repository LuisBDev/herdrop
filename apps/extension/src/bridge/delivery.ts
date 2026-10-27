import type { BundleFile, DropStatus } from '@herdrop/protocol';
import type { Annotation, DispatchResult, Draft, DraftEvent } from '../draft/model.ts';
import { type BridgeClient, BridgeHttpError, BridgeUnreachable } from './client.ts';

export type DeliveryDeps = {
  client: BridgeClient;
  readDraft: () => Promise<Draft>;
  dispatch: (event: DraftEvent) => Promise<DispatchResult>;
  render: (annotations: Annotation[]) => BundleFile[];
  sleep: (ms: number) => Promise<void>;
  newRequestId: () => string;
};

export const INTERRUPTED_MESSAGE = 'Send was interrupted.';
export const LOST_MESSAGE = 'The bridge restarted and lost this drop.';

const POLL_INTERVAL_MS = 1000;
const MAX_UNREACHABLE_POLLS = 5;

type Sending = Extract<Draft, { phase: 'sending' }>;

const isDropNotFound = (error: unknown): boolean =>
  error instanceof BridgeHttpError && error.status === 404 && error.code === 'drop_not_found';

async function apply(deps: DeliveryDeps, event: DraftEvent): Promise<boolean> {
  return (await deps.dispatch(event)).ok;
}

async function currentSending(deps: DeliveryDeps): Promise<Sending | null> {
  const draft = await deps.readDraft();
  return draft.phase === 'sending' ? draft : null;
}

function statusEvent(drop: DropStatus): DraftEvent {
  switch (drop.state) {
    case 'delivered':
      return { type: 'send.delivered', drop };
    case 'failed':
      return {
        type: 'send.failed',
        reason: 'failed',
        drop,
        message: drop.message ?? 'Drop failed.',
      };
    case 'sent_no_activity':
    case 'agent_gone':
    case 'agent_blocked':
      return { type: 'send.failed', reason: drop.state, drop, message: drop.message };
    case 'running':
      return { type: 'send.progress', drop };
  }
}

async function poll(deps: DeliveryDeps, dropId: string): Promise<void> {
  let misses = 0;
  for (;;) {
    let drop: DropStatus;
    try {
      drop = await deps.client.dropStatus(dropId);
    } catch (error) {
      if (isDropNotFound(error)) {
        await apply(deps, {
          type: 'send.failed',
          reason: 'bridge_unreachable',
          drop: null,
          message: LOST_MESSAGE,
        });
        return;
      }
      if (!(error instanceof BridgeUnreachable)) throw error;
      misses += 1;
      if (misses >= MAX_UNREACHABLE_POLLS) throw error;
      await deps.sleep(POLL_INTERVAL_MS);
      continue;
    }
    misses = 0;
    if (!(await apply(deps, statusEvent(drop))) || drop.state !== 'running') return;
    await deps.sleep(POLL_INTERVAL_MS);
  }
}

async function create(deps: DeliveryDeps, draft: Sending): Promise<void> {
  const { drop_id } = await deps.client.createDrop({
    client_request_id: draft.clientRequestId,
    machine: draft.destination.machine,
    pane_id: draft.destination.paneId,
    files: deps.render(draft.annotations),
  });
  if (!(await apply(deps, { type: 'send.created', dropId: drop_id }))) return;
  await poll(deps, drop_id);
}

async function retry(deps: DeliveryDeps, dropId: string): Promise<void> {
  try {
    await deps.client.retryDrop(dropId);
  } catch (error) {
    if (isDropNotFound(error)) {
      if (!(await apply(deps, { type: 'send.recreate', clientRequestId: deps.newRequestId() }))) {
        return;
      }
      const again = await currentSending(deps);
      if (again) await create(deps, again);
      return;
    }
    if (!(error instanceof BridgeHttpError && error.status === 409)) throw error;
  }
  await poll(deps, dropId);
}

async function deliver(deps: DeliveryDeps, mode: 'new' | 'retry' | 'resume'): Promise<void> {
  const draft = await currentSending(deps);
  if (!draft) return;
  if (mode === 'resume') {
    if (draft.dropId === null) {
      await apply(deps, {
        type: 'send.failed',
        reason: 'failed',
        drop: null,
        message: INTERRUPTED_MESSAGE,
      });
      return;
    }
    await poll(deps, draft.dropId);
    return;
  }
  if (mode === 'retry' && draft.dropId !== null) {
    await retry(deps, draft.dropId);
    return;
  }
  await create(deps, draft);
}

function failureEvent(error: unknown): DraftEvent {
  if (error instanceof BridgeUnreachable) {
    return { type: 'send.failed', reason: 'bridge_unreachable', drop: null, message: null };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { type: 'send.failed', reason: 'failed', drop: null, message };
}

export async function runDelivery(
  deps: DeliveryDeps,
  mode: 'new' | 'retry' | 'resume',
): Promise<void> {
  try {
    await deliver(deps, mode);
  } catch (error) {
    try {
      await deps.dispatch(failureEvent(error));
    } catch {
      return;
    }
  }
}

export async function sendDraft(deps: DeliveryDeps): Promise<void> {
  if (await apply(deps, { type: 'send.start', clientRequestId: deps.newRequestId() })) {
    await runDelivery(deps, 'new');
  }
}

export async function retryDraft(deps: DeliveryDeps): Promise<void> {
  if (await apply(deps, { type: 'send.retry' })) {
    await runDelivery(deps, 'retry');
  }
}
