import * as vscode from 'vscode';
import { buildReadCommand } from './buildReadCommand';

const terminalsByTab = new Map<string, vscode.Terminal>();
let nextTerminalOrdinal = 1;

export function registerTabTerminalCleanup(): vscode.Disposable {
  return vscode.window.onDidCloseTerminal(closed => {
    for (const [tabId, terminal] of terminalsByTab) {
      if (terminal === closed) {
        terminalsByTab.delete(tabId);
        return;
      }
    }
  });
}

function findOrCreateTerminalForTab(tabId: string): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = terminalsByTab.get(tabId);
  if (existing) {
    return { terminal: existing, isNew: false };
  }
  const terminal = vscode.window.createTerminal(`Kanbrain ${nextTerminalOrdinal++}`);
  terminalsByTab.set(tabId, terminal);
  return { terminal, isNew: true };
}

export function sendReadCommandForTab(tabId: string, relativeContextFilePath: string, aiProviderCommand?: string): void {
  const { terminal, isNew } = findOrCreateTerminalForTab(tabId);
  terminal.show();
  if (isNew && aiProviderCommand) {
    terminal.sendText(aiProviderCommand);
  }
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
