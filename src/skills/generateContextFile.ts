import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';
import { writeGeneratedFile } from './writeGeneratedFile';
import type { ProfileEntry, WorkflowStepConfig } from '../types';

const CARD_INFO_TEMPLATE = `Work item: {{title}} (#{{id}})
Type: {{type}}
Status: {{status}}
Description: {{description}}

Parent: {{parent.title}} (#{{parent.id}})

Subtasks:
{{subtasks}}`;

function prependProfileBlock(content: string, profile: ProfileEntry | null): string {
  if (!profile) {
    return content;
  }
  return `## Requester profile\n**${profile.label}** — ${profile.description}\n\n---\n\n${content}`;
}

function appendWorkflowStepBlock(content: string, workflowStep: WorkflowStepConfig | null): string {
  const sections: string[] = [];
  if (workflowStep?.definitionOfDone?.length) {
    sections.push(`## Definition of Done\n${workflowStep.definitionOfDone.map(item => `- ${item}`).join('\n')}`);
  }
  if (workflowStep?.artifacts?.length) {
    sections.push(`## Expected artifacts\n${workflowStep.artifacts.map(item => `- ${item}`).join('\n')}`);
  }
  if (sections.length === 0) {
    return content;
  }
  return `${content}\n\n---\n\n${sections.join('\n\n')}`;
}

// The skill path is user-supplied, so its basename can carry anything a file name can — spaces,
// accents, capitals. Strip it down to what is safe and readable in a generated file name.
function toSkillSlug(skillTemplatePath: string): string {
  return path
    .basename(skillTemplatePath, '.md')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  profile: ProfileEntry | null,
  workflowStep: WorkflowStepConfig | null = null,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);
  const cardInfo = resolvePlaceholders(CARD_INFO_TEMPLATE, context);
  const withCardInfo = `${cardInfo}\n\n---\n\n${resolved}`;
  const withWorkflowStep = appendWorkflowStepBlock(withCardInfo, workflowStep);
  const withProfile = prependProfileBlock(withWorkflowStep, profile);

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const slug = toSkillSlug(skillTemplatePath);
  const fileName = slug ? `${context.workItem.id}-${slug}-${timestamp}.md` : `${context.workItem.id}-${timestamp}.md`;

  return writeGeneratedFile(workspaceRoot, fileName, withProfile);
}
