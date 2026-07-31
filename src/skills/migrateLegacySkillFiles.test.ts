import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { stripLegacyCardInfoBlock, migrateLegacySkillFiles } from './migrateLegacySkillFiles';

const LEGACY_STATUS_SKILL = `# Skill: Task — In Progress

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Describe here what the agent should do when the work item is in this status.
`;

const LEGACY_EXPLAIN_CARD = `# Skill: Explain Card

Work item: {{title}} (#{{id}})
Type: {{type}}
Status: {{status}}
Description: {{description}}

Parent: {{parent.title}} (#{{parent.id}})

Subtasks:
{{subtasks}}

## Instructions
Explain this work item to the user in your own words.
`;

describe('stripLegacyCardInfoBlock', () => {
  it('strips the legacy status-skill card info block, leaving the heading and instructions intact', () => {
    const result = stripLegacyCardInfoBlock(LEGACY_STATUS_SKILL);

    expect(result).toBe(`# Skill: Task — In Progress

## Instructions
Describe here what the agent should do when the work item is in this status.
`);
  });

  it('strips the legacy explain-card block, leaving the heading and instructions intact', () => {
    const result = stripLegacyCardInfoBlock(LEGACY_EXPLAIN_CARD);

    expect(result).toBe(`# Skill: Explain Card

## Instructions
Explain this work item to the user in your own words.
`);
  });

  it('leaves an already-migrated skill file untouched', () => {
    const content = `# Skill: Task — In Progress

## Instructions
Do the thing.
`;
    expect(stripLegacyCardInfoBlock(content)).toBe(content);
  });

  it('leaves a fully custom skill file untouched', () => {
    const content = `# My custom skill

Just do whatever the user asks.
`;
    expect(stripLegacyCardInfoBlock(content)).toBe(content);
  });

  it('strips the legacy block when the file uses CRLF line endings (e.g. Windows checkouts)', () => {
    const crlfContent = LEGACY_STATUS_SKILL.replace(/\n/g, '\r\n');

    const result = stripLegacyCardInfoBlock(crlfContent);

    expect(result).not.toContain('Work item: {{title}}');
    expect(result).toContain('## Instructions');
  });

  it('preserves custom instructions written after the legacy block', () => {
    const content = `# Skill: Task — In Progress

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Run the tests, then move the card to Done if they pass.
`;
    const result = stripLegacyCardInfoBlock(content);

    expect(result).toContain('Run the tests, then move the card to Done if they pass.');
    expect(result).not.toContain('Work item: {{title}}');
  });
});

describe('migrateLegacySkillFiles', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-migrate-skills-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('does nothing when the skills directory does not exist', () => {
    expect(() => migrateLegacySkillFiles(workspaceRoot)).not.toThrow();
  });

  it('rewrites a legacy status-skill file on disk with the block stripped', () => {
    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const filePath = path.join(skillsDir, 'task-inprogress.md');
    fs.writeFileSync(filePath, LEGACY_STATUS_SKILL, 'utf-8');

    migrateLegacySkillFiles(workspaceRoot);

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).not.toContain('Work item: {{title}}');
    expect(written).toContain('## Instructions');
  });

  it('rewrites a legacy explain-card file on disk with the block stripped', () => {
    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const filePath = path.join(skillsDir, 'explain-card.md');
    fs.writeFileSync(filePath, LEGACY_EXPLAIN_CARD, 'utf-8');

    migrateLegacySkillFiles(workspaceRoot);

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).not.toContain('Parent: {{parent.title}}');
    expect(written).toContain('## Instructions');
  });

  it('does not touch a file that is already migrated', () => {
    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const filePath = path.join(skillsDir, 'task-done.md');
    const content = '# Skill: Task — Done\n\n## Instructions\nDo the thing.\n';
    fs.writeFileSync(filePath, content, 'utf-8');
    const statBefore = fs.statSync(filePath).mtimeMs;

    migrateLegacySkillFiles(workspaceRoot);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
    expect(fs.statSync(filePath).mtimeMs).toBe(statBefore);
  });

  it('ignores non-markdown files in the skills directory', () => {
    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'notes.txt'), LEGACY_STATUS_SKILL, 'utf-8');

    expect(() => migrateLegacySkillFiles(workspaceRoot)).not.toThrow();
    expect(fs.readFileSync(path.join(skillsDir, 'notes.txt'), 'utf-8')).toBe(LEGACY_STATUS_SKILL);
  });
});
