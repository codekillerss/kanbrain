import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverWorkItemTypes, discoverStatusColors } from '../azureDevOps/discoverWorkItemTypes';
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
    let types;
    try {
      boardState = await discoverBoardState(client, result.config.organization, result.config.project);
      types = await discoverWorkItemTypes(client, result.config.organization, result.config.project);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not sync the board configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const freshStatusColors = discoverStatusColors(types);
    const diff = diffBoardConfig(result.config, boardState.discoveredStatusesByType);

    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
    );
    writeConfig(workspaceRoot, updated);

    if (isDiffEmpty(diff)) {
      vscode.window.showInformationMessage('Kanbrain board configuration was already up to date.');
    } else {
      vscode.window.showInformationMessage(`Kanbrain board configuration synced: ${summarizeDiff(diff)}.`);
    }
  });
}
