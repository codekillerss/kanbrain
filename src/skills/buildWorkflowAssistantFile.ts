import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';
import type { SkillEntry, WorkflowStepConfig } from '../types';
import { renderDiscoveredTypes, renderDiscoveredBoards } from './renderDiscoveredBoardInfo';

function skillLabel(id: string, skills: Record<string, SkillEntry>): string {
  const entry = skills[id];
  if (!entry) {
    return `${id} (missing from the registry!)`;
  }
  return entry.label || (entry.path ? (entry.path.split('/').pop() ?? entry.path) : id);
}

function renderSkillRegistry(skills: Record<string, SkillEntry>): string {
  const entries = Object.entries(skills);
  if (entries.length === 0) {
    return '_No skills registered yet._';
  }
  return entries.map(([id, entry]) => `- \`${id}\` — **${entry.label || entry.path}** (\`${entry.path}\`)${entry.isGlobal ? ' — global' : ''}`).join('\n');
}

function renderWorkflowSteps(workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>>, skills: Record<string, SkillEntry>): string {
  const types = Object.entries(workflowSteps);
  if (types.length === 0) {
    return '_No workflow steps configured yet._';
  }
  return types
    .map(([type, statuses]) => {
      const lines = Object.entries(statuses)
        .map(([status, step]) => {
          if (!step?.skillId) {
            return `  - ${status}: _no skill_`;
          }
          return `  - ${status}: \`${step.skillId}\` (${skillLabel(step.skillId, skills)})${step.definitionOfDone?.length ? `, DoD: ${step.definitionOfDone.length} item(s)` : ''}${step.artifacts?.length ? `, artifacts: ${step.artifacts.length} item(s)` : ''}`;
        })
        .join('\n');
      return `### ${type}\n\n${lines}`;
    })
    .join('\n\n');
}

export function buildWorkflowAssistantContent(
  organization: string,
  project: string,
  types: DiscoveredWorkItemType[],
  boards: DiscoveredBoard[],
  skills: Record<string, SkillEntry>,
  workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>>,
): string {
  const skillCount = Object.keys(skills).length;

  return `# Kanbrain Workflow Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## Scope

This file is scoped to **workflow only** — don't create or edit entries in \`.kanbrain/config.json\`'s \`skills\` registry itself (only reference existing \`skillId\`s from it), and don't touch \`repositories\` or \`profiles\` while following it.

## Step 0 — make sure skills exist first

\`.kanbrain/config.json\` currently has **${skillCount} skill(s)** registered (see "This project's real configuration" below). A workflow step is only useful once it points at a real skill, so:

- If the registry is empty, or clearly has far fewer skills than the real flow needs, **stop before doing anything else** and tell the user: "You don't have any skills configured yet. Would you like me to create and configure the skills first?"
- If they say yes, run the **Kanbrain: Configure Skills with AI** command yourself (via the \`kanbrain.configureSkillsWithAi\` VS Code command, if you can invoke commands directly; otherwise ask the user to click "✨ Configure with AI" under the Skills section of the Kanbrain panel) and follow the instructions file it generates to completion before coming back here.
- If they say no, or the registry already looks reasonably complete, continue with the steps below using whatever skills already exist.

## What a workflow step is

\`.kanbrain/config.json\`'s \`workflowSteps\` map links a (work item type, status) pair to a \`skillId\` from the \`skills\` registry, plus an optional **Definition of Done** (a checklist) and a list of expected **artifacts** for that step. Both are injected into the context file whenever that status's skill button runs, right after the card info block.

## This project's real configuration

### Skill registry (\`skills\`)

${renderSkillRegistry(skills)}

### Current workflow steps (\`workflowSteps\`)

${renderWorkflowSteps(workflowSteps, skills)}

### Work item types and statuses

${renderDiscoveredTypes(types)}

### Boards and columns

${renderDiscoveredBoards(boards)}

## What to do

1. For every (work item type, status) listed above, pick the \`skillId\` from the registry that matches the real flow step that status represents — reuse the same \`skillId\` for every status that shares a step, the same way statuses sharing a board column usually share one.
2. For each step, think through a concrete **Definition of Done** — what "finished with this step" looks like for that kind of work item — and write it as a short checklist (each item is one line). Do the same for **expected artifacts** (e.g. "Pull request opened", "Tests passing", "Validation comment published") when the step has any worth naming; skip it when a step genuinely has none.
3. Present your full proposed mapping (status → skill, plus its Definition of Done and artifacts) to the user in one message and ask them to confirm it or correct any entries before writing anything.
4. Once confirmed, update \`.kanbrain/config.json\`'s \`workflowSteps\` map accordingly. Never invent or rename an entry in the \`skills\` registry from here — if a needed skill doesn't exist, go back to Step 0.
5. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
