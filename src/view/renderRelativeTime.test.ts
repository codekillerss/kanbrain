import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './renderRelativeTime';

const NOW = new Date('2026-07-30T12:00:00Z');

describe('formatRelativeTime', () => {
  it('shows "just now" for under a minute ago', () => {
    expect(formatRelativeTime('2026-07-30T11:59:30Z', NOW)).toBe('just now');
  });

  it('shows minutes ago for under an hour', () => {
    expect(formatRelativeTime('2026-07-30T11:45:00Z', NOW)).toBe('15 minutes ago');
  });

  it('uses singular "minute" for exactly 1 minute', () => {
    expect(formatRelativeTime('2026-07-30T11:59:00Z', NOW)).toBe('1 minute ago');
  });

  it('shows hours ago for under a day', () => {
    expect(formatRelativeTime('2026-07-30T09:00:00Z', NOW)).toBe('3 hours ago');
  });

  it('uses singular "hour" for exactly 1 hour', () => {
    expect(formatRelativeTime('2026-07-30T11:00:00Z', NOW)).toBe('1 hour ago');
  });

  it('shows days ago for under a week', () => {
    expect(formatRelativeTime('2026-07-28T12:00:00Z', NOW)).toBe('2 days ago');
  });

  it('uses singular "day" for exactly 1 day', () => {
    expect(formatRelativeTime('2026-07-29T12:00:00Z', NOW)).toBe('1 day ago');
  });

  it('falls back to a locale date string at 7 days or older', () => {
    const result = formatRelativeTime('2026-07-01T12:00:00Z', NOW);
    expect(result).not.toContain('ago');
    expect(result).toBe(new Date('2026-07-01T12:00:00Z').toLocaleDateString());
  });
});
