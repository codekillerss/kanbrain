import { describe, it, expect, vi } from 'vitest';
import { skipWhileRunning } from './skipWhileRunning';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('skipWhileRunning', () => {
  it('skips calls made while a previous run is still in flight', async () => {
    const pending = deferred();
    const task = vi.fn(() => pending.promise);
    const run = skipWhileRunning(task);

    const first = run();
    void run();
    void run();
    expect(task).toHaveBeenCalledTimes(1);

    pending.resolve();
    await first;
  });

  it('runs again once the previous run has finished', async () => {
    const task = vi.fn(() => Promise.resolve());
    const run = skipWhileRunning(task);

    await run();
    await run();

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('runs again after a previous run rejected', async () => {
    const failing = deferred();
    const task = vi.fn().mockImplementationOnce(() => failing.promise).mockImplementation(() => Promise.resolve());
    const run = skipWhileRunning(task);

    const first = run();
    failing.reject(new Error('network down'));
    await expect(first).rejects.toThrow('network down');

    await run();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
