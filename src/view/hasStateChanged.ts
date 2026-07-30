export function serializeState(config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown = {}, extra: unknown = null): string {
  return JSON.stringify({ config, workItem, subtasks, avatars, extra });
}

export function hasStateChanged(
  previous: string,
  config: unknown,
  workItem: unknown,
  subtasks: unknown,
  avatars: unknown = {},
  extra: unknown = null,
): boolean {
  return serializeState(config, workItem, subtasks, avatars, extra) !== previous;
}
