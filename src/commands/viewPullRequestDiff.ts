import * as vscode from 'vscode';
import { readConfig } from '../config/config';

export function registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand(
    'kanbrain.viewPullRequestDiff',
    async (repositoryId: string, sourceBranch: string, targetBranch: string) => {
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

      await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(repoEntry.path), {
        ref1: targetBranch,
        ref2: sourceBranch,
      });
    },
  );
}
