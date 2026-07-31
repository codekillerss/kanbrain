import * as fs from 'node:fs';
import * as path from 'node:path';

// Skill files generated before card info moved into the always-injected context-file header
// (see generateContextFile.ts) had this block written directly into their own content. Existing
// skill files on disk were never rewritten automatically, so without this migration they'd keep
// showing the card info twice: once from the new header, once from their own leftover copy.
const LEGACY_EXPLAIN_CARD_BLOCK =
  'Work item: {{title}} (#{{id}})\nType: {{type}}\nStatus: {{status}}\nDescription: {{description}}\n\nParent: {{parent.title}} (#{{parent.id}})\n\nSubtasks:\n{{subtasks}}\n\n';

const LEGACY_STATUS_SKILL_BLOCK =
  'Work item: {{title}} (#{{id}})\nStatus: {{status}}\nDescription: {{description}}\n\nSubtasks:\n{{subtasks}}\n\n';

const LEGACY_BLOCKS = [LEGACY_EXPLAIN_CARD_BLOCK, LEGACY_STATUS_SKILL_BLOCK];

export function stripLegacyCardInfoBlock(content: string): string {
  for (const block of LEGACY_BLOCKS) {
    if (content.includes(block)) {
      return content.replace(block, '');
    }
  }
  return content;
}

export function migrateLegacySkillFiles(workspaceRoot: string): void {
  const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
  if (!fs.existsSync(skillsDir)) {
    return;
  }

  for (const fileName of fs.readdirSync(skillsDir)) {
    if (!fileName.endsWith('.md')) {
      continue;
    }
    const filePath = path.join(skillsDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const migrated = stripLegacyCardInfoBlock(content);
    if (migrated !== content) {
      fs.writeFileSync(filePath, migrated, 'utf-8');
    }
  }
}
