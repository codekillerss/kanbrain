import { describe, it, expect } from 'vitest';
import { classifyPrThreads } from './classifyPrThreads';
import type { PullRequestThread } from '../types';

function thread(overrides: Partial<PullRequestThread> & { openedById?: string } = {}): PullRequestThread {
  const { openedById, ...rest } = overrides;
  return {
    id: 1,
    status: 'active',
    filePath: null,
    line: null,
    comments: [
      {
        id: 1,
        parentCommentId: 0,
        text: 'Please fix this',
        createdBy: { id: openedById ?? 'other-user', displayName: 'Someone', imageUrl: null },
        createdDate: '2026-01-01T00:00:00Z',
      },
    ],
    ...rest,
  };
}

describe('classifyPrThreads', () => {
  it('hasAnyActiveThread is true when any thread (from anyone) is active', () => {
    const result = classifyPrThreads([thread({ status: 'active', openedById: 'reviewer-1' })], 'me');
    expect(result.hasAnyActiveThread).toBe(true);
  });

  it('hasAnyActiveThread is false when no thread is active', () => {
    const result = classifyPrThreads([thread({ status: 'fixed', openedById: 'reviewer-1' })], 'me');
    expect(result.hasAnyActiveThread).toBe(false);
  });

  it('hasMyThreadsAllResolved is true when every thread I opened is resolved', () => {
    const result = classifyPrThreads(
      [thread({ id: 1, status: 'fixed', openedById: 'me' }), thread({ id: 2, status: 'closed', openedById: 'me' })],
      'me',
    );
    expect(result.hasMyThreadsAllResolved).toBe(true);
  });

  it('hasMyThreadsAllResolved is false when at least one thread I opened is still active', () => {
    const result = classifyPrThreads(
      [thread({ id: 1, status: 'fixed', openedById: 'me' }), thread({ id: 2, status: 'active', openedById: 'me' })],
      'me',
    );
    expect(result.hasMyThreadsAllResolved).toBe(false);
  });

  it('hasMyThreadsAllResolved is false when I opened no threads at all (empty set is not "all resolved")', () => {
    const result = classifyPrThreads([thread({ status: 'fixed', openedById: 'reviewer-1' })], 'me');
    expect(result.hasMyThreadsAllResolved).toBe(false);
  });

  it('ignores other people\'s resolved/unresolved threads when computing hasMyThreadsAllResolved', () => {
    const result = classifyPrThreads(
      [thread({ id: 1, status: 'fixed', openedById: 'me' }), thread({ id: 2, status: 'active', openedById: 'reviewer-2' })],
      'me',
    );
    expect(result.hasMyThreadsAllResolved).toBe(true);
  });

  it('treats pending and unknown statuses as unresolved, not fixed', () => {
    const pending = classifyPrThreads([thread({ status: 'pending', openedById: 'me' })], 'me');
    expect(pending.hasMyThreadsAllResolved).toBe(false);
    const unknown = classifyPrThreads([thread({ status: 'unknown', openedById: 'me' })], 'me');
    expect(unknown.hasMyThreadsAllResolved).toBe(false);
  });

  it('returns both false for an empty thread list', () => {
    const result = classifyPrThreads([], 'me');
    expect(result).toEqual({ hasAnyActiveThread: false, hasMyThreadsAllResolved: false });
  });
});
