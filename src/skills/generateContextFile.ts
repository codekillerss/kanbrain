import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';

export function generateContextFile(
  workspaceRoot: string,
  skillTemplatePath: string,
  context: SkillTemplateContext,
  now: Date = new Date(),
): string {
  const templateFullPath = path.join(workspaceRoot, skillTemplatePath);
  const template = fs.readFileSync(templateFullPath, 'utf-8');
  const resolved = resolvePlaceholders(template, context);

  const generatedDir = path.join(workspaceRoot, '.kanbrain', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${context.workItem.id}-${timestamp}.md`;
  fs.writeFileSync(path.join(generatedDir, fileName), resolved, 'utf-8');

  return path.join('.kanbrain', 'generated', fileName);
}
