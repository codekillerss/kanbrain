import * as vscode from 'vscode';
import type { PullRequestDetailPanelManager } from '../view/PullRequestDetailPanelManager';

export function registerOpenPullRequestDetailCommand(prDetailPanelManager: PullRequestDetailPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openPullRequestDetail', async (repositoryId: string, pullRequestId: number) => {
    await prDetailPanelManager.open(repositoryId, pullRequestId);
  });
}
