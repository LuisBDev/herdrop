import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecodeError } from '@herdrop/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { settingsItem } from '../storage/items.ts';
import { BridgeHttpError, BridgeUnreachable, createBridgeClient } from './client.ts';
import { bridgeBase } from './settings.ts';

type Recorded = { url: string; init: RequestInit | undefined };

const BASE = 'http://127.0.0.1:47821';
const base = async () => BASE;

function recorder(response: () => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response();
  }) as typeof fetch;
  return { calls, fetchFn };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/protocol/fixtures',
        name,
      ),
      'utf8',
    ),
  );
const agentsBody = fixture('agents-local.json');
const dropBody = fixture('create-drop-response.json') as { drop_id: string };

describe('bridge client', () => {
  it('request_shapes_table', async () => {
    const { calls, fetchFn } = recorder(() => json({}));
    const client = createBridgeClient(fetchFn, base);
    const req = {
      client_request_id: 'abc-123',
      machine: 'local',
      pane_id: 'w1:p1',
      files: [{ name: 'README.md', content: 'x' }],
    };

    await client.agents('a b/ç').catch(() => undefined);
    await client.agents('local', { refresh: true }).catch(() => undefined);
    await client.createDrop(req as never).catch(() => undefined);
    await client.retryDrop('d 1').catch(() => undefined);

    expect(calls.map((c) => [c.init?.method ?? 'GET', c.url])).toEqual([
      ['GET', `${BASE}/agents?machine=a%20b%2F%C3%A7`],
      ['GET', `${BASE}/agents?machine=local&refresh=true`],
      ['POST', `${BASE}/drops`],
      ['POST', `${BASE}/drops/d%201/retry`],
    ]);
    expect(calls[0]?.init?.cache).toBe('no-store');
    const headers = new Headers(calls[2]?.init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual(req);
    expect(calls[3]?.init?.body).toBeUndefined();
  });

  it('error_mapping_table', async () => {
    const run = (response: () => Response | Promise<Response>) =>
      createBridgeClient(recorder(response).fetchFn, base)
        .dropStatus('x')
        .catch((e: unknown) => e);

    const notFound = await run(() =>
      json({ error: { code: 'drop_not_found', message: 'gone' } }, 404),
    );
    expect(notFound).toBeInstanceOf(BridgeHttpError);
    expect(notFound).toMatchObject({ status: 404, code: 'drop_not_found', message: 'gone' });

    const invalid = await run(() =>
      json({ error: { code: 'invalid_request', message: 'bad id' } }, 400),
    );
    expect(invalid).toMatchObject({ status: 400, code: 'invalid_request' });

    const opaque = await run(() => new Response('<html>boom</html>', { status: 500 }));
    expect(opaque).toMatchObject({
      status: 500,
      code: 'http_500',
      message: 'The bridge answered HTTP 500.',
    });

    const cause = new TypeError('failed to fetch');
    const unreachable = await run(() => Promise.reject(cause));
    expect(unreachable).toBeInstanceOf(BridgeUnreachable);
    expect((unreachable as Error).cause).toBe(cause);

    expect(await run(() => json({ nope: true }))).toBeInstanceOf(DecodeError);
    const ok = createBridgeClient(recorder(() => json(agentsBody)).fetchFn, base);
    expect((await ok.agents('local')).machine).toBe('local');
    const created = createBridgeClient(recorder(() => json(dropBody, 202)).fetchFn, base);
    expect((await created.retryDrop('x')).drop_id).toBe(dropBody.drop_id);
  });

  describe('bridge_base_uses_settings_port', () => {
    beforeEach(() => fakeBrowser.reset());

    it('reads the configured port', async () => {
      expect(await bridgeBase()).toBe('http://127.0.0.1:47821');
      await settingsItem.setValue({ bridgePort: 47899 });
      expect(await bridgeBase()).toBe('http://127.0.0.1:47899');
    });
  });
});
