import * as vscode from 'vscode';
import { readConfig, writeConfig } from '../config/config';
import { cloneRepository } from '../git/cloneRepository';
import type { KanbrainViewProvider } from '../view/KanbrainViewProvider';

export function registerResolveRepositoryTagCommand(workspaceRoot: string, provider: KanbrainViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.resolveRepositoryTag', async (repositoryId: string) => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      return;
    }

    const entry = config.repositories?.[repositoryId];
    if (!entry) {
      const choice = await vscode.window.showInformationMessage(
        "This repository doesn't seem to exist in this project.",
        'Sync Board Configuration',
      );
      if (choice === 'Sync Board Configuration') {
        await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
      }
      return;
    }

    const actionPick = await vscode.window.showQuickPick(
      [
        { label: 'Configure path', action: 'configure' as const },
        { label: 'Clone repository', action: 'clone' as const },
      ],
      { placeHolder: `Repository "${entry.name}" has no local path configured` },
    );
    if (!actionPick) {
      return;
    }

    if (actionPick.action === 'configure') {
      await vscode.commands.executeCommand('kanbrain.view.focus');
      provider.showRepositoriesScreen();
      return;
    }

    const parentUris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(workspaceRoot),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select destination folder',
    });
    const parentDir = parentUris?.[0]?.fsPath;
    if (!parentDir) {
      return;
    }

    const cloneUrl = `https://dev.azure.com/${config.organization}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(entry.name)}`;

    try {
      const clonedPath = await cloneRepository(parentDir, cloneUrl, entry.name);
      const freshConfig = readConfig(workspaceRoot);
      if (freshConfig?.repositories?.[repositoryId]) {
        freshConfig.repositories[repositoryId].path = clonedPath;
        writeConfig(workspaceRoot, freshConfig);
      }
      vscode.window.showInformationMessage(`Cloned "${entry.name}" to ${clonedPath}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Clone failed: ${detail}`);
    }
  });
}
