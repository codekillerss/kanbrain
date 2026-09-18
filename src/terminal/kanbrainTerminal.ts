import * as vscode from 'vscode';
import { buildReadCommand } from './buildReadCommand';

const TERMINAL_NAME = 'Kanbrain';

function findOrCreateTerminal(): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
  if (existing) {
    return { terminal: existing, isNew: false };
  }
  return { terminal: vscode.window.createTerminal(TERMINAL_NAME), isNew: true };
}

export function sendReadCommand(relativeContextFilePath: string, aiProviderCommand?: string): void {
  const { terminal, isNew } = findOrCreateTerminal();
  terminal.show();
  if (isNew && aiProviderCommand) {
    terminal.sendText(aiProviderCommand);
  }
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
