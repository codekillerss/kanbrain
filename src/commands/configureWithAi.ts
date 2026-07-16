import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverBoardColumns } from '../azureDevOps/discoverBoardColumns';
import { buildSetupAssistantContent } from '../skills/buildSetupAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig } from '../config/config';

export async function configureWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const discovered = await discoverBoardState(client, config.organization, config.project);
    const boards = await discoverBoardColumns(client, config.organization, config.project, team);
    content = buildSetupAssistantContent(config.organization, config.project, discovered, boards);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's board configuration: ${message}`);
    return;
  }

  const fileName = `setup-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureWithAi', () => configureWithAi(client, workspaceRoot));
}
