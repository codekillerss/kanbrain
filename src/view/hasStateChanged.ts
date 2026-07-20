export function serializeState(config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown = {}): string {
  return JSON.stringify({ config, workItem, subtasks, avatars });
}

export function hasStateChanged(previous: string, config: unknown, workItem: unknown, subtasks: unknown, avatars: unknown = {}): boolean {
  return serializeState(config, workItem, subtasks, avatars) !== previous;
}
