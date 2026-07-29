import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverLocalRepositories } from '../git/discoverLocalRepositories';
import { matchRepositoriesToLocalPaths } from '../config/matchRepositoriesToLocalPaths';
import { buildRepositoriesAssistantContent } from '../skills/buildRepositoriesAssistantFile';
import { writeGeneratedFile } from '../skills/writeGeneratedFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { readConfig, DEFAULT_REPO_SCAN_DEPTH } from '../config/config';

export async function configureRepositoriesWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const azureRepos = await client.listRepositories(config.organization, config.project);
    const repoScanDepth = Math.max(1, config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH);
    const localRepos = await discoverLocalRepositories(workspaceRoot, repoScanDepth);
    const repositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);
    content = buildRepositoriesAssistantContent(config.organization, config.project, repositories);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's repositories: ${message}`);
    return;
  }

  const fileName = `repositories-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}

export function registerConfigureRepositoriesWithAiCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.configureRepositoriesWithAi', () => configureRepositoriesWithAi(client, workspaceRoot));
}
