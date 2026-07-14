export function serializeState(config: unknown, workItem: unknown, subtasks: unknown): string {
  return JSON.stringify({ config, workItem, subtasks });
}

export function hasStateChanged(previous: string, config: unknown, workItem: unknown, subtasks: unknown): boolean {
  return serializeState(config, workItem, subtasks) !== previous;
}
