const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

export function formatRelativeTime(dateIso: string, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - new Date(dateIso).getTime();

  if (elapsedMs < MINUTE_MS) {
    return 'just now';
  }
  if (elapsedMs < HOUR_MS) {
    return pluralize(Math.floor(elapsedMs / MINUTE_MS), 'minute');
  }
  if (elapsedMs < DAY_MS) {
    return pluralize(Math.floor(elapsedMs / HOUR_MS), 'hour');
  }
  if (elapsedMs < WEEK_MS) {
    return pluralize(Math.floor(elapsedMs / DAY_MS), 'day');
  }
  return new Date(dateIso).toLocaleDateString();
}
