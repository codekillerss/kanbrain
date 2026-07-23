import * as vscode from 'vscode';
import type { WorkItemDetailPanelManager } from '../view/WorkItemDetailPanelManager';

export function registerOpenWorkItemDetailCommand(detailPanelManager: WorkItemDetailPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openWorkItemDetail', async (id: number) => {
    await detailPanelManager.open(id);
  });
}
