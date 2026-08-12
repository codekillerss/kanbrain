import type { PullRequestThread } from '../types';

const RESOLVED_STATUSES = new Set(['fixed', 'closed', 'wontFix', 'byDesign']);

export interface PrThreadClassification {
  hasAnyActiveThread: boolean;
  hasMyThreadsAllResolved: boolean;
}

export function classifyPrThreads(threads: PullRequestThread[], currentUserId: string): PrThreadClassification {
  const hasAnyActiveThread = threads.some(t => t.status === 'active');

  const myThreads = threads.filter(t => t.comments[0]?.createdBy.id === currentUserId);
  const hasMyThreadsAllResolved = myThreads.length > 0 && myThreads.every(t => RESOLVED_STATUSES.has(t.status));

  return { hasAnyActiveThread, hasMyThreadsAllResolved };
}
