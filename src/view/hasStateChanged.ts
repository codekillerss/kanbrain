export function serializeState(
  config: unknown,
  workItem: unknown,
  parent: unknown,
  subtasks: unknown,
  avatars: unknown = {},
  extra: unknown = null,
): string {
  return JSON.stringify({ config, workItem, parent, subtasks, avatars, extra });
}

export function hasStateChanged(
  previous: string,
  config: unknown,
  workItem: unknown,
  parent: unknown,
  subtasks: unknown,
  avatars: unknown = {},
  extra: unknown = null,
): boolean {
  return serializeState(config, workItem, parent, subtasks, avatars, extra) !== previous;
}
