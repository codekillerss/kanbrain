import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverStatusColors } from '../azureDevOps/discoverWorkItemTypes';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';

const EXAMPLE_SKILL = `# Example skill

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Describe here what the agent should do when the work item is in this status.
`;

export function registerSetupCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onSetupComplete: () => void,
  extensionVersion: string,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.setup', async () => {
    const organizations = await client.listOrganizations();
    if (organizations.length === 0) {
      vscode.window.showErrorMessage('No Azure DevOps organization found for this account.');
      return;
    }
    const orgPick = await vscode.window.showQuickPick(
      organizations.map(o => ({ label: o.name, org: o })),
      { placeHolder: 'Select the Azure DevOps organization' },
    );
    if (!orgPick) {
      return;
    }

    const projects = await client.listProjects(orgPick.org.name);
    if (projects.length === 0) {
      vscode.window.showErrorMessage(`No project found in the ${orgPick.org.name} organization.`);
      return;
    }
    const projectPick = await vscode.window.showQuickPick(
      projects.map(p => ({ label: p.name, project: p })),
      { placeHolder: 'Select the Azure DevOps project' },
    );
    if (!projectPick) {
      return;
    }

    let boardState;
    try {
      boardState = await discoverBoardState(client, orgPick.org.name, projectPick.project.name);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's work item types: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam } = boardState;

    let types;
    try {
      types = await discoverWorkItemTypes(client, orgPick.org.name, projectPick.project.name);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's status colors: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const statusColors = discoverStatusColors(types);

    const generateFilesPick = await vscode.window.showQuickPick(
      [
        { label: 'Yes', generate: true },
        { label: 'No', generate: false },
      ],
      { placeHolder: 'Automatically generate placeholder skill files per work item type and status?' },
    );
    if (!generateFilesPick) {
      return;
    }

    const preset = buildPresetPlan(discoveredStatusesByType, generateFilesPick.generate, statusColors);

    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const file of preset.filesToWrite) {
      const fullPath = path.join(workspaceRoot, file.relativePath);
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, file.content, 'utf-8');
      }
    }

    const exampleSkillPath = path.join(skillsDir, 'example.md');
    if (!fs.existsSync(exampleSkillPath)) {
      fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    }

    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      defaultTeam,
      skills: preset.skills,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByTeam,
      lastSyncedVersion: extensionVersion,
    });

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    onSetupComplete();

    vscode.window.showInformationMessage(
      `Kanbrain configured: ${orgPick.org.name}/${projectPick.project.name}. Edit .kanbrain/config.json to map skills per status.`,
    );
  });
}
