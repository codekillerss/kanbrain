import type { KanbrainConfig, CardFieldSettings } from '../types';

function resolveCardField(
  config: KanbrainConfig,
  workItemType: string,
  selectedBoard: string | undefined,
  field: keyof CardFieldSettings,
): boolean {
  const boards = config.cardSettingsByBoard ?? {};
  const matches = Object.entries(boards).filter(([, byType]) => workItemType in byType);

  if (matches.length === 0) {
    return false;
  }
  if (matches.length === 1) {
    return matches[0][1][workItemType][field];
  }

  const selectedMatch = matches.find(([name]) => name === selectedBoard);
  return (selectedMatch ?? matches[0])[1][workItemType][field];
}

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedBoard: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedBoard, 'parent');
}

export function resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedBoard: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedBoard, 'assignedTo');
}
