import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import { checkoutBranch } from '../git/checkoutBranch';
import { listLocalBranches } from '../git/listBranches';

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

    const action = await vscode.window.showWarningMessage(`Branch "${branchName}"`, { modal: true }, 'Checkout', 'Compare with');
    if (action === 'Checkout') {
      await handleCheckout(repoEntry.path, branchName);
    } else if (action === 'Compare with') {
      await handleCompare(repoEntry.path, branchName);
    }
  });
}

async function handleCheckout(repoPath: string, branchName: string): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(`Check out branch "${branchName}"?`, { modal: true }, 'Checkout');
  if (confirm !== 'Checkout') {
    return;
  }

  try {
    await checkoutBranch(repoPath, branchName);
    vscode.window.showInformationMessage(`Switched to branch "${branchName}".`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Checkout failed: ${detail}`);
  }
}

async function handleCompare(repoPath: string, branchName: string): Promise<void> {
  const branches = await listLocalBranches(repoPath);
  const otherBranches = branches.filter(b => b !== branchName);
  if (otherBranches.length === 0) {
    vscode.window.showErrorMessage('No other local branches found to compare with.');
    return;
  }

  const picked = await vscode.window.showQuickPick(otherBranches, { placeHolder: `Compare "${branchName}" with...` });
  if (!picked) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(`Compare "${branchName}" with "${picked}"?`, { modal: true }, 'Compare');
  if (confirm !== 'Compare') {
    return;
  }

  try {
    await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(repoPath), { ref1: picked, ref2: branchName });
  } catch {
    vscode.window.showErrorMessage('GitLens is required to compare branches. Install it from the Extensions view.');
  }
}
