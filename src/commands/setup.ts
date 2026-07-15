import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemTypeState } from '../azureDevOps/backlogLevels';
import { discoverBacklogLevelStates, discoverStatusColors, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';
import { sanitizeSvg } from '../view/sanitizeSvg';

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

    let levels;
    try {
      const team = await client.getDefaultTeamName(orgPick.org.name, projectPick.project.name);
      levels = await client.listBacklogLevels(orgPick.org.name, projectPick.project.name, team);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's backlog levels: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const statesByType: Record<string, WorkItemTypeState[]> = {};
    const uniqueTypes = Array.from(new Set(levels.flatMap(level => level.workItemTypes)));
    for (const type of uniqueTypes) {
      try {
        statesByType[type] = await client.listWorkItemTypeStates(orgPick.org.name, projectPick.project.name, type);
      } catch {
        // One-off failure for a type: continue without it instead of aborting the whole Setup.
      }
    }

    const discovered = discoverBacklogLevelStates(levels, statesByType);
    const typeToBacklogLevel = buildTypeToBacklogLevel(levels, new Set(Object.keys(statesByType)));
    const statusColors = discoverStatusColors(levels, statesByType);

    const typeColors: Record<string, string> = {};
    const typeIcons: Record<string, string> = {};
    for (const type of uniqueTypes) {
      try {
        const icon = await client.getWorkItemTypeIcon(orgPick.org.name, projectPick.project.name, type);
        if (icon) {
          typeColors[type] = icon.color;
          typeIcons[type] = sanitizeSvg(icon.iconSvg);
        }
      } catch {
        // One-off failure for a type: continue without its icon/color instead of aborting the whole Setup.
      }
    }

    const generateFilesPick = await vscode.window.showQuickPick(
      [
        { label: 'Yes', generate: true },
        { label: 'No', generate: false },
      ],
      { placeHolder: 'Automatically generate placeholder skill files per category (Proposed/InProgress/Resolved)?' },
    );
    if (!generateFilesPick) {
      return;
    }

    const preset = buildPresetPlan(discovered, generateFilesPick.generate);

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
      typeToBacklogLevel,
      backlogLevels: preset.backlogLevels,
      statusColors,
      typeColors,
      typeIcons,
    });

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    onSetupComplete();

    vscode.window.showInformationMessage(
      `Kanbrain configured: ${orgPick.org.name}/${projectPick.project.name}. Edit .kanbrain/config.json to map skills per status.`,
    );
  });
}
