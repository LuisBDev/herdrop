import type { Health } from '@herdrop/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BridgeUnreachable } from '../bridge/client.ts';
import { reloadedForVersionItem } from '../storage/items.ts';
import { reloadForDeployedVersion, type SelfUpdateDeps } from './self-update.ts';

const INSTALLED = '0.1.0';

function deps(health: () => Promise<Health>, draftIsEmpty = true) {
  const reload = vi.fn();
  const value: SelfUpdateDeps = {
    health,
    installedVersion: () => INSTALLED,
    draftIsEmpty: async () => draftIsEmpty,
    reloadedFor: reloadedForVersionItem,
    reload,
  };
  return { value, reload };
}

const bridge = (extension_version: string | null) => async (): Promise<Health> => ({
  name: 'herdrop',
  version: '0.2.0',
  extension_version,
});

describe('reloadForDeployedVersion', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('reloads_once_for_each_newly_deployed_version', async () => {
    const run = deps(bridge('0.2.0'));

    await reloadForDeployedVersion(run.value);
    await reloadForDeployedVersion(run.value);

    expect(run.reload).toHaveBeenCalledTimes(1);
    expect(await reloadedForVersionItem.getValue()).toBe('0.2.0');

    const next = deps(bridge('0.3.0'));
    await reloadForDeployedVersion(next.value);
    expect(next.reload).toHaveBeenCalledTimes(1);
  });

  it('stays_loaded_when_there_is_nothing_newer_to_load', async () => {
    const cases: [string, () => Promise<Health>][] = [
      ['same version', bridge(INSTALLED)],
      ['no deployed extension', bridge(null)],
      [
        'bridge unreachable',
        async () => {
          throw new BridgeUnreachable(new TypeError('fetch failed'));
        },
      ],
    ];
    for (const [name, health] of cases) {
      const run = deps(health);
      await reloadForDeployedVersion(run.value);
      expect(run.reload, name).not.toHaveBeenCalled();
    }
    expect(await reloadedForVersionItem.getValue()).toBeNull();
  });

  it('waits_while_the_draft_holds_annotations', async () => {
    const busy = deps(bridge('0.2.0'), false);
    await reloadForDeployedVersion(busy.value);
    expect(busy.reload).not.toHaveBeenCalled();

    const idle = deps(bridge('0.2.0'), true);
    await reloadForDeployedVersion(idle.value);
    expect(idle.reload).toHaveBeenCalledTimes(1);
  });
});
