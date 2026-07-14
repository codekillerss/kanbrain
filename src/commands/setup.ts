import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemTypeState } from '../azureDevOps/backlogLevels';
import { discoverBacklogLevelStates, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';

const EXAMPLE_SKILL = `# Skill de exemplo

Work item: {{title}} (#{{id}})
Status: {{status}}
Descrição: {{description}}

Subtasks:
{{subtasks}}

## Instruções
Descreva aqui o que o agente deve fazer quando o work item estiver neste status.
`;

export function registerSetupCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onSetupComplete: () => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.setup', async () => {
    const organizations = await client.listOrganizations();
    if (organizations.length === 0) {
      vscode.window.showErrorMessage('Nenhuma organização Azure DevOps encontrada para esta conta.');
      return;
    }
    const orgPick = await vscode.window.showQuickPick(
      organizations.map(o => ({ label: o.name, org: o })),
      { placeHolder: 'Selecione a organização Azure DevOps' },
    );
    if (!orgPick) {
      return;
    }

    const projects = await client.listProjects(orgPick.org.name);
    if (projects.length === 0) {
      vscode.window.showErrorMessage(`Nenhum projeto encontrado na organização ${orgPick.org.name}.`);
      return;
    }
    const projectPick = await vscode.window.showQuickPick(
      projects.map(p => ({ label: p.name, project: p })),
      { placeHolder: 'Selecione o projeto Azure DevOps' },
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
        `Não foi possível ler os backlog levels do processo: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const statesByType: Record<string, WorkItemTypeState[]> = {};
    const uniqueTypes = Array.from(new Set(levels.flatMap(level => level.workItemTypes)));
    for (const type of uniqueTypes) {
      try {
        statesByType[type] = await client.listWorkItemTypeStates(orgPick.org.name, projectPick.project.name, type);
      } catch {
        // Falha pontual num tipo: segue sem ele em vez de abortar o Setup inteiro.
      }
    }

    const discovered = discoverBacklogLevelStates(levels, statesByType);
    const typeToBacklogLevel = buildTypeToBacklogLevel(levels, new Set(Object.keys(statesByType)));

    const generateFilesPick = await vscode.window.showQuickPick(
      [
        { label: 'Sim', generate: true },
        { label: 'Não', generate: false },
      ],
      { placeHolder: 'Gerar arquivos de skill placeholder automaticamente por categoria (Proposed/InProgress/Resolved)?' },
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
    });

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    onSetupComplete();

    vscode.window.showInformationMessage(
      `Kanbrain configurado: ${orgPick.org.name}/${projectPick.project.name}. Edite .kanbrain/config.json para mapear skills por status.`,
    );
  });
}
