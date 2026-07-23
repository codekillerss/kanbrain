import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { readConfig } from '../config/config';
import { getRemoteUrl } from '../git/getRemoteUrl';
import { checkoutBranch } from '../git/checkoutBranch';
import { isSameRepository } from '../git/isSameRepository';

export function registerCheckoutBranchCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkoutBranch', async (repositoryId: string, branchName: string) => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      return;
    }

    const [repository, localRemoteUrl] = await Promise.all([
      client.getRepository(config.organization, config.project, repositoryId).catch(() => null),
      getRemoteUrl(workspaceRoot),
    ]);

    const sameRepo = repository ? isSameRepository(repository.name, localRemoteUrl) : null;
    const message =
      sameRepo === false
        ? `This branch belongs to repository "${repository!.name}", which doesn't look like the currently open workspace. Check out "${branchName}" anyway?`
        : `Check out branch "${branchName}"?`;

    const choice = await vscode.window.showWarningMessage(message, { modal: true }, 'Checkout');
    if (choice !== 'Checkout') {
      return;
    }

    try {
      await checkoutBranch(workspaceRoot, branchName);
      vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
    }
  });
}
