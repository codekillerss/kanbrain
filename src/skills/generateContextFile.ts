import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';
import { writeGeneratedFile } from './writeGeneratedFile';
import type { ProfileEntry } from '../types';

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

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  profile: ProfileEntry | null,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);
  const cardInfo = resolvePlaceholders(CARD_INFO_TEMPLATE, context);
  const withCardInfo = `${cardInfo}\n\n---\n\n${resolved}`;
  const withProfile = prependProfileBlock(withCardInfo, profile);

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${context.workItem.id}-${timestamp}.md`;

  return writeGeneratedFile(workspaceRoot, fileName, withProfile);
}
