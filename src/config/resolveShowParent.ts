import type { KanbrainConfig } from '../types';

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedBoard: string | undefined): boolean {
  const boards = config.cardSettingsByBoard ?? {};
  const matches = Object.entries(boards).filter(([, byType]) => workItemType in byType);

  if (matches.length === 0) {
    return false;
  }
  if (matches.length === 1) {
    return matches[0][1][workItemType];
  }

  const selectedMatch = matches.find(([name]) => name === selectedBoard);
  return (selectedMatch ?? matches[0])[1][workItemType];
}
