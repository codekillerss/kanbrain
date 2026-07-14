import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { readConfig } from '../config/config';

interface WorkItemQuickPickItem extends vscode.QuickPickItem {
  id: number;
}

export function registerSelectWorkItemCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  context: vscode.ExtensionContext,
  onSelect: (id: number) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.selectWorkItem', async () => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      vscode.window.showErrorMessage('Rode "Kanbrain: Setup" antes de selecionar um work item.');
      return;
    }

    const quickPick = vscode.window.createQuickPick<WorkItemQuickPickItem>();
    quickPick.placeholder = 'Buscar work item por título ou #id…';

    quickPick.onDidChangeValue(async value => {
      quickPick.busy = true;
      const ids = await client.searchWorkItems(config.organization, config.project, value);
      const items = ids.length ? await client.getWorkItems(config.organization, config.project, ids) : [];
      quickPick.items = items.map(item => ({ label: `#${item.id} ${item.title}`, description: item.status, id: item.id }));
      quickPick.busy = false;
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        void context.workspaceState.update('kanbrain.activeWorkItemId', selected.id);
        onSelect(selected.id);
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  });
}
