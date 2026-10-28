import { expect, test } from 'vitest';
import agentsLocal from '../fixtures/agents-local.json';
import agentsRemoteError from '../fixtures/agents-remote-error.json';
import agentsRemoteRefreshing from '../fixtures/agents-remote-refreshing.json';
import apiError from '../fixtures/api-error.json';
import apiErrorDropNotFound from '../fixtures/api-error-drop-not-found.json';
import apiErrorInvalidRequest from '../fixtures/api-error-invalid-request.json';
import createDropResponse from '../fixtures/create-drop-response.json';
import dropStatusAgentBlocked from '../fixtures/drop-status-agent-blocked.json';
import dropStatusDelivered from '../fixtures/drop-status-delivered.json';
import dropStatusFailed from '../fixtures/drop-status-failed.json';
import dropStatusRunning from '../fixtures/drop-status-running.json';
import health from '../fixtures/health.json';
import healthLegacy from '../fixtures/health-legacy.json';
import machines from '../fixtures/machines.json';
import machinesHerdrMissing from '../fixtures/machines-herdr-missing.json';
import {
  DecodeError,
  decodeAgents,
  decodeApiError,
  decodeCreateDrop,
  decodeDropStatus,
  decodeHealth,
  decodeMachines,
} from './decode.ts';

test('fixtures_decode_unchanged', () => {
  const rows: [string, (v: unknown) => unknown, unknown][] = [
    ['health', decodeHealth, health],
    ['machines', decodeMachines, machines],
    ['machines-herdr-missing', decodeMachines, machinesHerdrMissing],
    ['agents-local', decodeAgents, agentsLocal],
    ['agents-remote-refreshing', decodeAgents, agentsRemoteRefreshing],
    ['agents-remote-error', decodeAgents, agentsRemoteError],
    ['create-drop-response', decodeCreateDrop, createDropResponse],
    ['drop-status-running', decodeDropStatus, dropStatusRunning],
    ['drop-status-delivered', decodeDropStatus, dropStatusDelivered],
    ['drop-status-agent-blocked', decodeDropStatus, dropStatusAgentBlocked],
    ['drop-status-failed', decodeDropStatus, dropStatusFailed],
    ['api-error', decodeApiError, apiError],
    ['api-error-drop-not-found', decodeApiError, apiErrorDropNotFound],
    ['api-error-invalid-request', decodeApiError, apiErrorInvalidRequest],
  ];
  for (const [name, decode, fixture] of rows) {
    expect(decode(fixture), name).toEqual(fixture);
  }
});

test('bad_values_name_their_path', () => {
  const badStatus = structuredClone(agentsLocal);
  (badStatus.agents[0] as { status: string }).status = 'sleeping';
  const missingKey = structuredClone(machines);
  delete (missingKey.machines[0] as { key?: string }).key;
  const badError = { ...machines, error: 5 };
  const rows: [(v: unknown) => unknown, unknown, string][] = [
    [decodeAgents, badStatus, 'agents[0].status'],
    [decodeMachines, missingKey, 'machines[0].key'],
    [decodeMachines, badError, 'error'],
  ];
  for (const [decode, value, path] of rows) {
    expect(() => decode(value)).toThrow(DecodeError);
    expect(() => decode(value)).toThrow(path);
  }
});

test('health_without_an_extension_version_decodes_to_null', () => {
  expect(decodeHealth(healthLegacy)).toEqual({ ...healthLegacy, extension_version: null });
  expect(decodeHealth({ ...health, extension_version: null }).extension_version).toBeNull();
  expect(() => decodeHealth({ ...health, extension_version: 5 })).toThrow('extension_version');
});
