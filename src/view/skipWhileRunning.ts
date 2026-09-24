// For interval-driven polls: on a slow network a tick can outlast the interval, and without this
// the next tick starts a second, duplicate round of requests on top of the first.
export function skipWhileRunning(task: () => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await task();
    } finally {
      running = false;
    }
  };
}
