import * as vscode from 'vscode';
import * as path from 'node:path';
import { readConfig } from '../config/config';

export function registerViewPullRequestDiffAtLineCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand(
    'kanbrain.viewPullRequestDiffAtLine',
    async (repositoryId: string, sourceBranch: string, targetBranch: string, filePath: string, line: number | null) => {
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

      const uri = vscode.Uri.file(path.join(repoEntry.path, filePath));

      await vscode.commands.executeCommand('gitlens.diffWith', {
        repoPath: repoEntry.path,
        lhs: { sha: targetBranch, uri },
        rhs: { sha: sourceBranch, uri },
        range: line != null ? { startLine: line, startCharacter: 1, endLine: line, endCharacter: 1, active: 'start' } : undefined,
      });
    },
  );
}
