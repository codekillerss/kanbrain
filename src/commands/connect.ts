import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { connectAzureSession } from '../auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from '../auth/vscodeSession';
import { validateProjectAccess } from '../azureDevOps/validateProjectAccess';
import { readConfig } from '../config/config';

export async function connectToAzureDevOps(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onConnected: () => void,
): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  try {
    await connectAzureSession(getVscodeMicrosoftSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(message);
    return;
  }

  let hasAccess: boolean;
  try {
    hasAccess = await validateProjectAccess(client, config.organization, config.project);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Connected, but couldn't verify access to ${config.organization}/${config.project} due to a connection error: ${message}. Try Kanbrain: Connect to Azure DevOps again.`,
    );
    return;
  }
  if (!hasAccess) {
    vscode.window.showErrorMessage(
      `Connected, but this account has no access to ${config.organization}/${config.project}. Run Kanbrain: Connect to Azure DevOps again to pick a different account.`,
    );
    return;
  }

  vscode.window.showInformationMessage(`Connected to ${config.organization}/${config.project}.`);
  onConnected();
}

export function registerConnectCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onConnected: () => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.connect', () => connectToAzureDevOps(client, workspaceRoot, onConnected));
}
