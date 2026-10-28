import { expect, it, vi } from 'vitest';
import type { DeliveryDeps } from '../../bridge/delivery.ts';
import type { Draft } from '../../draft/model.ts';
import { createDeliverController } from './deliver-controller.ts';

const delivery = {} as DeliveryDeps;

function gate() {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function fakeDriver() {
  const pending = gate();
  return {
    pending,
    driver: {
      sendDraft: vi.fn(() => pending.promise),
      retryDraft: vi.fn(() => Promise.resolve()),
      runDelivery: vi.fn(() => Promise.resolve()),
    },
  };
}

it('resume_on_load_only_when_sending', async () => {
  for (const [phase, calls] of [
    ['drafting', 0],
    ['sending', 1],
  ] as const) {
    const { driver } = fakeDriver();
    const draft = () => ({ phase }) as Draft;
    await createDeliverController({ delivery, draft, driver }).resumeOnLoad();
    expect(driver.runDelivery).toHaveBeenCalledTimes(calls);
    if (calls) expect(driver.runDelivery).toHaveBeenCalledWith(delivery, 'resume');
  }
});

it('second_call_while_running_is_ignored', async () => {
  const { driver, pending } = fakeDriver();
  const controller = createDeliverController({
    delivery,
    draft: () => ({ phase: 'sending' }) as Draft,
    driver,
  });
  const first = controller.send();
  await controller.send();
  await controller.retry();
  await controller.resumeOnLoad();
  pending.open();
  await first;
  expect(driver.sendDraft).toHaveBeenCalledTimes(1);
  expect(driver.retryDraft).not.toHaveBeenCalled();
  expect(driver.runDelivery).not.toHaveBeenCalled();
  await controller.retry();
  expect(driver.retryDraft).toHaveBeenCalledTimes(1);
});

it('started_at_set_while_running_and_cleared_after', async () => {
  const { driver, pending } = fakeDriver();
  const controller = createDeliverController({
    delivery,
    draft: () => ({ phase: 'drafting' }) as Draft,
    driver,
    now: () => 1234,
  });
  expect(controller.startedAt()).toBeNull();
  const running = controller.send();
  expect(controller.startedAt()).toBe(1234);
  pending.open();
  await running;
  expect(controller.startedAt()).toBeNull();
});
