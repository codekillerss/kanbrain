import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateContextFile } from './generateContextFile';
import type { SkillTemplateContext } from './resolvePlaceholders';
import type { WorkItem, ProfileEntry } from '../types';

let workspaceRoot: string;

const workItem: WorkItem = {
  id: 482,
  title: 'Fix bug',
  description: 'desc',
  status: 'Active',
  type: 'Task',
  url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
  parentId: null,
  childIds: [],
  assignedTo: null,
  development: [],
};

const context: SkillTemplateContext = { workItem, parent: null, subtasks: [], branch: 'feature/90' };

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-ctx-'));
  fs.mkdirSync(path.join(workspaceRoot, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'skills', 'fix.md'), 'Title: {{title}} (#{{id}})');
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('generateContextFile', () => {
  it('writes the resolved template under .kanbrain/generated', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    expect(relativePath.startsWith(path.join('.kanbrain', 'generated'))).toBe(true);
    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).toBe('Title: Fix bug (#482)');
  });

  it('names the file with the work item id and a filesystem-safe timestamp', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    expect(path.basename(relativePath)).toBe('482-2026-07-14T10-00-00-000Z.md');
  });

  it('creates the .kanbrain/generated directory if it does not exist', () => {
    generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain', 'generated'))).toBe(true);
  });

  it('prepends a Requester profile block when a profile is given', () => {
    const profile: ProfileEntry = { label: 'Developer', description: 'I am a developer.' };
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, profile, new Date('2026-07-14T10:00:00.000Z'));

    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).toBe('## Requester profile\n**Developer** — I am a developer.\n\n---\n\nTitle: Fix bug (#482)');
  });

  it('does not add a Requester profile block when profile is null', () => {
    const relativePath = generateContextFile(workspaceRoot, 'skills/fix.md', context, null, new Date('2026-07-14T10:00:00.000Z'));

    const written = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8');
    expect(written).not.toContain('Requester profile');
  });
});
