export function createSerial(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const previous = tail;
    const run = (async () => {
      await previous;
      return task();
    })();
    tail = (async () => {
      try {
        await run;
      } catch {
        return;
      }
    })();
    return run;
  };
}
