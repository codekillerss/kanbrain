import * as vscode from 'vscode';
import { buildReadCommand } from './buildReadCommand';

const TERMINAL_NAME = 'Kanbrain';

function findOrCreateTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
  return existing ?? vscode.window.createTerminal(TERMINAL_NAME);
}

export function sendReadCommand(relativeContextFilePath: string): void {
  const terminal = findOrCreateTerminal();
  terminal.show(true);
  terminal.sendText(buildReadCommand(relativeContextFilePath));
}
