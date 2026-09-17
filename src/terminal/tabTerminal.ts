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

function findOrCreateTerminalForTab(tabId: string): vscode.Terminal {
  const existing = terminalsByTab.get(tabId);
  if (existing) {
    return existing;
  }
  const terminal = vscode.window.createTerminal(`Kanbrain ${nextTerminalOrdinal++}`);
  terminalsByTab.set(tabId, terminal);
  return terminal;
}

export function sendReadCommandForTab(tabId: string, relativeContextFilePath: string): void {
  const terminal = findOrCreateTerminalForTab(tabId);
  terminal.show();
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
