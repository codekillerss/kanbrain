import * as vscode from 'vscode';
import { isAzureDevOpsWebUrl } from './isAzureDevOpsWebUrl';

export function registerOpenWorkItemInBrowserCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.openWorkItemInBrowser', async (id: number, url: string) => {
    if (!isAzureDevOpsWebUrl(url)) {
      vscode.window.showErrorMessage(`Refusing to open #${id}: the link is not an Azure DevOps web address.`);
      return;
    }

    const choice = await vscode.window.showWarningMessage(`Open #${id} in the browser?`, { modal: true }, 'Open');
    if (choice !== 'Open') {
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(url));
  });
}
