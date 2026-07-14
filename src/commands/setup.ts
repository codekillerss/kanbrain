import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { writeConfig, ensureGitignoreEntry, readConfig } from '../config/config';

const EXAMPLE_SKILL = `# Skill de exemplo

Work item: {{title}} (#{{id}})
Status: {{status}}
Descrição: {{description}}

Subtasks:
{{subtasks}}

## Instruções
Descreva aqui o que o agente deve fazer quando o work item estiver neste status.
`;

export function registerSetupCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
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

    const existing = readConfig(workspaceRoot);
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      statusSkills: existing?.statusSkills ?? {},
    });

    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const exampleSkillPath = path.join(skillsDir, 'example.md');
    if (!fs.existsSync(exampleSkillPath)) {
      fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    }

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    vscode.window.showInformationMessage(
      `Kanbrain configurado: ${orgPick.org.name}/${projectPick.project.name}. Edite .kanbrain/config.json para mapear skills por status.`,
    );
  });
}
