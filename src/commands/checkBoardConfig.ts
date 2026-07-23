import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { diffBoardConfig, isDiffEmpty, summarizeDiff, type BoardConfigDiff } from '../azureDevOps/checkBoardConfig';
import { readConfigWithDiagnostics } from '../config/config';
import type { KanbrainConfig } from '../types';

export type CheckResult =
  | { status: 'missing' }
  | { status: 'invalid'; error: string }
  | { status: 'discovery-failed'; error: string }
  | { status: 'ok'; diff: BoardConfigDiff; config: KanbrainConfig };

export async function checkBoardConfig(client: AzureDevOpsClient, workspaceRoot: string): Promise<CheckResult> {
  const result = readConfigWithDiagnostics(workspaceRoot);
  if (result.status !== 'ok') {
    return result;
  }

  let boardState;
  try {
    boardState = await discoverBoardState(client, result.config.organization, result.config.project);
  } catch (error) {
    return { status: 'discovery-failed', error: error instanceof Error ? error.message : String(error) };
  }

  const diff = diffBoardConfig(result.config, boardState.discoveredStatusesByType);

  return { status: 'ok', diff, config: result.config };
}

export async function presentBoardConfigCheck(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  options: { quietWhenNothingToReport: boolean },
): Promise<void> {
  const result = await checkBoardConfig(client, workspaceRoot);

  if (result.status === 'missing') {
    if (!options.quietWhenNothingToReport) {
      vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    }
    return;
  }
  if (result.status === 'invalid') {
    vscode.window.showErrorMessage(`.kanbrain/config.json is not valid JSON: ${result.error}`);
    return;
  }
  if (result.status === 'discovery-failed') {
    vscode.window.showErrorMessage(`Could not check the board configuration: ${result.error}`);
    return;
  }
  if (isDiffEmpty(result.diff)) {
    if (!options.quietWhenNothingToReport) {
      vscode.window.showInformationMessage('Kanbrain board configuration is up to date.');
    }
    return;
  }

  const action = await vscode.window.showWarningMessage(
    `Kanbrain board configuration is out of date: ${summarizeDiff(result.diff)}.`,
    'Sync Now',
  );
  if (action === 'Sync Now') {
    await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
  }
}

export function registerCheckBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkBoardConfig', () =>
    presentBoardConfigCheck(client, workspaceRoot, { quietWhenNothingToReport: false }),
  );
}
