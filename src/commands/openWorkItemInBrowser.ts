import * as vscode from 'vscode';

export function registerOpenWorkItemInBrowserCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openWorkItemInBrowser', async (id: number, url: string) => {
    const choice = await vscode.window.showWarningMessage(`Open #${id} in the browser?`, { modal: true }, 'Open');
    if (choice !== 'Open') {
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(url));
  });
}
