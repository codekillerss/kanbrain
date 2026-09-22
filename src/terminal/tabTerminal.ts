import * as vscode from 'vscode';
import { buildReadCommand } from './buildReadCommand';
import { resolveAiProviderCommand } from './resolveAiProviderCommand';

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

function findOrCreateTerminalForTab(tabId: string, terminalName: string | undefined): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = terminalsByTab.get(tabId);
  if (existing) {
    return { terminal: existing, isNew: false };
  }
  const terminal = vscode.window.createTerminal(terminalName ?? `Kanbrain ${nextTerminalOrdinal++}`);
  terminalsByTab.set(tabId, terminal);
  return { terminal, isNew: true };
}

export function sendReadCommandForTab(
  tabId: string,
  relativeContextFilePath: string,
  aiProviderCommand?: string,
  terminalName?: string,
): void {
  const { terminal, isNew } = findOrCreateTerminalForTab(tabId, terminalName);
  terminal.show();
  const defaultCommand = vscode.workspace.getConfiguration('kanbrain').get<string>('defaultAiProviderCommand');
  const effectiveCommand = resolveAiProviderCommand(aiProviderCommand, defaultCommand);
  if (isNew && effectiveCommand) {
    terminal.sendText(effectiveCommand);
  }
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
