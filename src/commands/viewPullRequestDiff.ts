import * as vscode from 'vscode';

export function registerViewPullRequestDiffCommand(workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.viewPullRequestDiff', async (sourceBranch: string, targetBranch: string) => {
    await vscode.commands.executeCommand('gitlens.compareWith', vscode.Uri.file(workspaceRoot), {
      ref1: targetBranch,
      ref2: sourceBranch,
    });
  });
}
