export function serializeState(workItem: unknown, subtasks: unknown): string {
  return JSON.stringify({ workItem, subtasks });
}

export function hasStateChanged(previous: string, workItem: unknown, subtasks: unknown): boolean {
  return serializeState(workItem, subtasks) !== previous;
}
