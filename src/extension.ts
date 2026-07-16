import * as vscode from 'vscode';
import { ensureAzureSession, hasCachedAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
import { registerConnectCommand } from './commands/connect';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const client = workspaceRoot
    ? new AzureDevOpsClient({
        fetchImpl: fetch,
        getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
      })
    : undefined;

  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
    () => hasCachedAzureSession(getVscodeMicrosoftSession),
  );

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider));

  if (!workspaceRoot || !client) {
    return;
  }

  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
    registerConfigureWithAiCommand(client, workspaceRoot),
    registerConnectCommand(client, workspaceRoot, () => provider.markConnected()),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId);
  }
}

export function deactivate(): void {}
