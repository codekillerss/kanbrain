import * as vscode from 'vscode';
import { ensureAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const client = new AzureDevOpsClient({
    fetchImpl: fetch,
    getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
  });

  const provider = new KanbrainViewProvider(workspaceRoot, client, () => getCurrentBranch(workspaceRoot));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider),
    registerSetupCommand(client, workspaceRoot),
    registerSelectWorkItemCommand(client, workspaceRoot, context, id => provider.setActiveWorkItem(id)),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId);
  }
}

export function deactivate(): void {}
