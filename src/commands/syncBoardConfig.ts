import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverWorkItemTypes, discoverStatusColors } from '../azureDevOps/discoverWorkItemTypes';
import { diffBoardConfig, isDiffEmpty, summarizeDiff } from '../azureDevOps/checkBoardConfig';
import { syncConfig } from '../config/syncConfig';
import { readConfigWithDiagnostics, writeConfig, DEFAULT_REPO_SCAN_DEPTH } from '../config/config';
import { discoverLocalRepositories } from '../git/discoverLocalRepositories';
import { matchRepositoriesToLocalPaths } from '../config/matchRepositoriesToLocalPaths';
import {
  EXPLAIN_CARD_SKILL_CONTENT,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  VALIDATION_COMMENT_SKILL_CONTENT,
  VALIDATION_COMMENT_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_CONTENT,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureSeededGlobalSkills,
  ensureDefaultProfiles,
  isBootstrapContentMissing,
} from '../skills/bootstrapContent';
import { migrateLegacySkillFiles } from '../skills/migrateLegacySkillFiles';

export function registerSyncBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string, extensionVersion: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.syncBoardConfig', async () => {
    const result = readConfigWithDiagnostics(workspaceRoot);
    if (result.status === 'missing') {
      vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
      return;
    }
    if (result.status === 'invalid') {
      vscode.window.showErrorMessage(`.kanbrain/config.json is not valid JSON: ${result.error}`);
      return;
    }

    let boardState;
    let types;
    try {
      boardState = await discoverBoardState(client, result.config.organization, result.config.project);
      types = await discoverWorkItemTypes(client, result.config.organization, result.config.project);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not sync the board configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const explainCardSkillPath = path.join(workspaceRoot, EXPLAIN_CARD_SKILL_RELATIVE_PATH);
    if (!fs.existsSync(explainCardSkillPath)) {
      fs.writeFileSync(explainCardSkillPath, EXPLAIN_CARD_SKILL_CONTENT, 'utf-8');
    }

    const validationCommentSkillPath = path.join(workspaceRoot, VALIDATION_COMMENT_SKILL_RELATIVE_PATH);
    if (!fs.existsSync(validationCommentSkillPath)) {
      fs.writeFileSync(validationCommentSkillPath, VALIDATION_COMMENT_SKILL_CONTENT, 'utf-8');
    }

    const usageGuidePath = path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH);
    if (!fs.existsSync(usageGuidePath)) {
      fs.writeFileSync(usageGuidePath, USAGE_GUIDE_CONTENT, 'utf-8');
    }

    migrateLegacySkillFiles(workspaceRoot);

    const freshStatusColors = discoverStatusColors(types);
    const diff = diffBoardConfig(
      result.config,
      boardState.discoveredStatusesByType,
      isBootstrapContentMissing(workspaceRoot, result.config),
    );

    const azureRepos = await client.listRepositories(result.config.organization, result.config.project);
    const repoScanDepth = Math.max(1, result.config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH);
    const localRepos = await discoverLocalRepositories(workspaceRoot, repoScanDepth);
    const freshRepositories = matchRepositoriesToLocalPaths(azureRepos, localRepos);

    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
      boardState.taskBacklogTypesByTeam,
      freshRepositories,
    );
    writeConfig(workspaceRoot, {
      ...updated,
      globalSkills: ensureSeededGlobalSkills(updated.globalSkills),
      profiles: ensureDefaultProfiles(updated.profiles),
      lastSyncedVersion: extensionVersion,
    });

    if (isDiffEmpty(diff)) {
      vscode.window.showInformationMessage('Kanbrain board configuration was already up to date.');
    } else {
      vscode.window.showInformationMessage(`Kanbrain board configuration synced: ${summarizeDiff(diff)}.`);
    }
  });
}
