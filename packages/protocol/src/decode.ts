import type {
  AgentStatus,
  AgentsResponse,
  AgentView,
  ApiError,
  CreateDropResponse,
  DropState,
  DropStatus,
  DropStep,
  FolderKind,
  Health,
  MachinesResponse,
  MachineView,
} from './types.ts';

export class DecodeError extends Error {
  constructor(path: string, expected: string) {
    super(`${path}: expected ${expected}`);
    this.name = 'DecodeError';
  }
}

type Reader<T> = (value: unknown, path: string) => T;

const AGENT_STATUS: Record<AgentStatus, true> = {
  idle: true,
  working: true,
  blocked: true,
  done: true,
  unknown: true,
};
const FOLDER_KIND: Record<FolderKind, true> = {
  cwd: true,
  foreground_cwd: true,
  home: true,
};
const DROP_STEP: Record<DropStep, true> = {
  check_agent: true,
  write_bundle: true,
  prompt_agent: true,
  wait_activity: true,
};
const DROP_STATE: Record<DropState, true> = {
  running: true,
  delivered: true,
  sent_no_activity: true,
  agent_gone: true,
  agent_blocked: true,
  failed: true,
};

const str: Reader<string> = (value, path) => {
  if (typeof value !== 'string') throw new DecodeError(path, 'string');
  return value;
};

const bool: Reader<boolean> = (value, path) => {
  if (typeof value !== 'boolean') throw new DecodeError(path, 'boolean');
  return value;
};

const nullable =
  <T>(read: Reader<T>): Reader<T | null> =>
  (value, path) =>
    value === null ? null : read(value, path);

const oneOf =
  <T extends string>(members: Record<T, true>): Reader<T> =>
  (value, path) => {
    if (typeof value !== 'string' || !Object.hasOwn(members, value)) {
      throw new DecodeError(path, `one of ${Object.keys(members).join(', ')}`);
    }
    return value as T;
  };

const list =
  <T>(read: Reader<T>): Reader<T[]> =>
  (value, path) => {
    if (!Array.isArray(value)) throw new DecodeError(path, 'array');
    return value.map((item, index) => read(item, `${path}[${index}]`));
  };

const record = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DecodeError(path, 'object');
  }
  return value as Record<string, unknown>;
};

const join = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

const field = <T>(obj: Record<string, unknown>, path: string, key: string, read: Reader<T>): T =>
  read(obj[key], join(path, key));

const readHealth: Reader<Health> = (value, path) => {
  const obj = record(value, path);
  return { name: field(obj, path, 'name', str), version: field(obj, path, 'version', str) };
};

const readMachine: Reader<MachineView> = (value, path) => {
  const obj = record(value, path);
  return {
    key: field(obj, path, 'key', str),
    label: field(obj, path, 'label', str),
    local: field(obj, path, 'local', bool),
  };
};

const readMachines: Reader<MachinesResponse> = (value, path) => {
  const obj = record(value, path);
  return {
    machines: field(obj, path, 'machines', list(readMachine)),
    error: field(obj, path, 'error', nullable(str)),
  };
};

const readAgent: Reader<AgentView> = (value, path) => {
  const obj = record(value, path);
  return {
    pane_id: field(obj, path, 'pane_id', str),
    name: field(obj, path, 'name', str),
    kind: field(obj, path, 'kind', nullable(str)),
    status: field(obj, path, 'status', oneOf(AGENT_STATUS)),
    focused: field(obj, path, 'focused', bool),
    folder: field(obj, path, 'folder', str),
    folder_kind: field(obj, path, 'folder_kind', oneOf(FOLDER_KIND)),
  };
};

const readAgents: Reader<AgentsResponse> = (value, path) => {
  const obj = record(value, path);
  return {
    machine: field(obj, path, 'machine', str),
    agents: field(obj, path, 'agents', list(readAgent)),
    refreshed_at: field(obj, path, 'refreshed_at', nullable(str)),
    refreshing: field(obj, path, 'refreshing', bool),
    error: field(obj, path, 'error', nullable(str)),
  };
};

const readCreateDrop: Reader<CreateDropResponse> = (value, path) => {
  const obj = record(value, path);
  return { drop_id: field(obj, path, 'drop_id', str) };
};

const readDropStatus: Reader<DropStatus> = (value, path) => {
  const obj = record(value, path);
  return {
    drop_id: field(obj, path, 'drop_id', str),
    machine: field(obj, path, 'machine', str),
    pane_id: field(obj, path, 'pane_id', str),
    state: field(obj, path, 'state', oneOf(DROP_STATE)),
    step: field(obj, path, 'step', oneOf(DROP_STEP)),
    bundle_dir: field(obj, path, 'bundle_dir', nullable(str)),
    message: field(obj, path, 'message', nullable(str)),
  };
};

const readApiError: Reader<ApiError> = (value, path) => {
  const obj = record(value, path);
  const inner = record(obj.error, join(path, 'error'));
  const innerPath = join(path, 'error');
  return {
    error: {
      code: field(inner, innerPath, 'code', str),
      message: field(inner, innerPath, 'message', str),
    },
  };
};

export const decodeHealth = (v: unknown): Health => readHealth(v, '');
export const decodeMachines = (v: unknown): MachinesResponse => readMachines(v, '');
export const decodeAgents = (v: unknown): AgentsResponse => readAgents(v, '');
export const decodeCreateDrop = (v: unknown): CreateDropResponse => readCreateDrop(v, '');
export const decodeDropStatus = (v: unknown): DropStatus => readDropStatus(v, '');
export const decodeApiError = (v: unknown): ApiError => readApiError(v, '');
