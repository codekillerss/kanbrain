import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';
import { buildProfilesAssistantContent } from '../skills/buildProfilesAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig } from '../config/config';

export async function configureProfilesWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const types = await discoverWorkItemTypes(client, config.organization, config.project);
    content = buildProfilesAssistantContent(config.organization, config.project, team, types, config.profiles ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's work item types: ${message}`);
    return;
  }

  const fileName = `profiles-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureProfilesWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureProfilesWithAi', () => configureProfilesWithAi(client, workspaceRoot));
}
