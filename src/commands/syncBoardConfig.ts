import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverBacklogLevelStates, discoverStatusColors, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { diffBoardConfig, isDiffEmpty, summarizeDiff } from '../azureDevOps/checkBoardConfig';
import { syncConfig } from '../config/syncConfig';
import { readConfigWithDiagnostics, writeConfig } from '../config/config';

export function registerSyncBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.syncBoardConfig', async () => {
    const result = readConfigWithDiagnostics(workspaceRoot);
    if (result.status === 'missing') {
      vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
      return;
    }
    if (result.status === 'invalid') {
      vscode.window.showErrorMessage(`.kanbrain/config.json is not valid JSON: ${result.error}`);
      return;
    }

    let boardState;
    try {
      boardState = await discoverBoardState(client, result.config.organization, result.config.project);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not sync the board configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const discovered = discoverBacklogLevelStates(boardState.levels, boardState.statesByType);
    const freshTypeToBacklogLevel = buildTypeToBacklogLevel(boardState.levels, new Set(Object.keys(boardState.statesByType)));
    const freshStatusColors = discoverStatusColors(boardState.levels, boardState.statesByType);
    const diff = diffBoardConfig(result.config, discovered, freshTypeToBacklogLevel);

    const updated = syncConfig(
      result.config,
      discovered,
      freshTypeToBacklogLevel,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.cardSettingsByBoard,
    );
    writeConfig(workspaceRoot, updated);

    if (isDiffEmpty(diff)) {
      vscode.window.showInformationMessage('Kanbrain board configuration was already up to date.');
    } else {
      vscode.window.showInformationMessage(`Kanbrain board configuration synced: ${summarizeDiff(diff)}.`);
    }
  });
}
