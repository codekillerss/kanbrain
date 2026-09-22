import * as vscode from 'vscode';
import type { KanbrainViewProvider } from '../view/KanbrainViewProvider';

export function registerOpenWorkItemInNewTabCommand(provider: KanbrainViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openWorkItemInNewTab', (id: number) => {
    provider.openNewTab(id);
  });
}
