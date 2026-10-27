import { afterEach, expect, it, vi } from 'vitest';
import { createFeedback } from './feedback.ts';

afterEach(() => {
  vi.useRealTimers();
});

it('toast_hides_after_3200_ms_and_a_new_toast_restarts_the_timer', () => {
  vi.useFakeTimers();
  const feedback = createFeedback();

  feedback.showToast('Copied');
  vi.advanceTimersByTime(3000);
  expect(feedback.toast()).toBe('Copied');

  feedback.showToast('Sent');
  vi.advanceTimersByTime(3199);
  expect(feedback.toast()).toBe('Sent');

  vi.advanceTimersByTime(1);
  expect(feedback.toast()).toBeNull();
});
