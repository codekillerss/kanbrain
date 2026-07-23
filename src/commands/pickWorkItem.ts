import * as vscode from 'vscode';
import type { KanbrainViewProvider } from '../view/KanbrainViewProvider';

export function registerPickWorkItemCommand(provider: KanbrainViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.pickWorkItem', (id: number) => {
    provider.setActiveWorkItem(id);
  });
}
