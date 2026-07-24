import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import { checkoutBranch } from '../git/checkoutBranch';

export function registerCheckoutBranchCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkoutBranch', async (repositoryId: string, branchName: string) => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      return;
    }

    const repoEntry = config.repositories?.[repositoryId];
    if (!repoEntry?.path) {
      const label = repoEntry?.name ?? 'this repository';
      vscode.window.showErrorMessage(`No local path configured for "${label}". Set it on the Repositories page (Home → Repositories).`);
      return;
    }

    const choice = await vscode.window.showWarningMessage(`Check out branch "${branchName}"?`, { modal: true }, 'Checkout');
    if (choice !== 'Checkout') {
      return;
    }

    try {
      await checkoutBranch(repoEntry.path, branchName);
      vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
    }
  });
}
