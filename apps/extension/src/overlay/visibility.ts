import { sameIds } from './locate.ts';

export type VisibilityReporter = {
  update(offscreen: string[]): void;
  report(): void;
};

export function createVisibilityReporter(
  send: (data: { url: string; offscreen: string[] }) => Promise<void>,
  url: () => string,
): VisibilityReporter {
  let last: string[] | null = null;

  const emit = (offscreen: string[]) => {
    void send({ url: url(), offscreen }).catch(() => {});
  };

  return {
    update(offscreen) {
      if (last !== null && sameIds(last, offscreen)) return;
      last = [...offscreen];
      emit(last);
    },
    report() {
      if (last !== null) emit(last);
    },
  };
}
