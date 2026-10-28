import {
  type AgentsResponse,
  type CreateDropRequest,
  type CreateDropResponse,
  type DropStatus,
  decodeAgents,
  decodeApiError,
  decodeCreateDrop,
  decodeDropStatus,
  decodeHealth,
  decodeMachines,
  type Health,
  type MachinesResponse,
} from '@herdrop/protocol';

export { bridgeBase } from './settings.ts';

export class BridgeUnreachable extends Error {
  constructor(cause: unknown) {
    super('The bridge is unreachable.', { cause });
    this.name = 'BridgeUnreachable';
  }
}

export class BridgeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeHttpError';
  }
}

export type BridgeClient = {
  health(): Promise<Health>;
  machines(): Promise<MachinesResponse>;
  agents(machine: string, opts?: { refresh?: boolean }): Promise<AgentsResponse>;
  createDrop(req: CreateDropRequest): Promise<CreateDropResponse>;
  dropStatus(id: string): Promise<DropStatus>;
  retryDrop(id: string): Promise<CreateDropResponse>;
};

async function failure(res: Response): Promise<BridgeHttpError> {
  try {
    const { code, message } = decodeApiError(await res.json()).error;
    return new BridgeHttpError(res.status, code, message);
  } catch {
    return new BridgeHttpError(
      res.status,
      `http_${res.status}`,
      `The bridge answered HTTP ${res.status}.`,
    );
  }
}

export function createBridgeClient(
  fetchFn: typeof fetch,
  base: () => Promise<string>,
): BridgeClient {
  async function call<T>(path: string, init: RequestInit, decode: (v: unknown) => T): Promise<T> {
    const url = `${await base()}${path}`;
    let res: Response;
    try {
      res = await fetchFn(url, init);
    } catch (cause) {
      throw new BridgeUnreachable(cause);
    }
    if (!res.ok) throw await failure(res);
    return decode(await res.json());
  }

  const get = <T>(path: string, decode: (v: unknown) => T) =>
    call(path, { method: 'GET', cache: 'no-store' }, decode);

  return {
    health: () => get('/health', decodeHealth),
    machines: () => get('/machines', decodeMachines),
    agents: (machine, opts) =>
      get(
        `/agents?machine=${encodeURIComponent(machine)}${opts?.refresh ? '&refresh=true' : ''}`,
        decodeAgents,
      ),
    createDrop: (req) =>
      call(
        '/drops',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
        },
        decodeCreateDrop,
      ),
    dropStatus: (id) => get(`/drops/${encodeURIComponent(id)}`, decodeDropStatus),
    retryDrop: (id) =>
      call(`/drops/${encodeURIComponent(id)}/retry`, { method: 'POST' }, decodeCreateDrop),
  };
}
