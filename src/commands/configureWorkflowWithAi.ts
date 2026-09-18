import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';
import { discoverBoardColumns } from '../azureDevOps/discoverBoardColumns';
import { buildWorkflowAssistantContent } from '../skills/buildWorkflowAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig } from '../config/config';

export async function configureWorkflowWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const types = await discoverWorkItemTypes(client, config.organization, config.project);
    const boards = await discoverBoardColumns(client, config.organization, config.project, team);
    content = buildWorkflowAssistantContent(config.organization, config.project, types, boards, config.skills, config.workflowSteps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's board configuration: ${message}`);
    return;
  }

  const fileName = `workflow-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath, config.aiProviderCommand);
}

export function registerConfigureWorkflowWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureWorkflowWithAi', () => configureWorkflowWithAi(client, workspaceRoot));
}
