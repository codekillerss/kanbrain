import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXPLAIN_CARD_SKILL_ID,
  EXPLAIN_CARD_SKILL_RELATIVE_PATH,
  USAGE_GUIDE_RELATIVE_PATH,
  ensureExplainCardGlobalSkill,
  isBootstrapContentMissing,
} from './bootstrapContent';
import type { KanbrainConfig, SkillEntry } from '../types';

describe('ensureExplainCardGlobalSkill', () => {
  it('adds the explain-card entry when there is no existing map', () => {
    const result = ensureExplainCardGlobalSkill(undefined);

    expect(Object.keys(result)).toEqual([EXPLAIN_CARD_SKILL_ID]);
    expect(result[EXPLAIN_CARD_SKILL_ID].path).toBe(EXPLAIN_CARD_SKILL_RELATIVE_PATH);
  });

  it('keeps existing entries and adds explain-card when it is missing', () => {
    const existing: Record<string, SkillEntry> = { 'other-skill': { path: 'x.md' } };
    const result = ensureExplainCardGlobalSkill(existing);

    expect(result['other-skill']).toEqual({ path: 'x.md' });
    expect(result[EXPLAIN_CARD_SKILL_ID].path).toBe(EXPLAIN_CARD_SKILL_RELATIVE_PATH);
  });

  it('leaves an existing explain-card entry untouched, including user customizations', () => {
    const existing: Record<string, SkillEntry> = { [EXPLAIN_CARD_SKILL_ID]: { path: 'custom.md', label: 'Custom' } };
    const result = ensureExplainCardGlobalSkill(existing);

    expect(result).toEqual(existing);
  });
});

function config(globalSkills?: Record<string, SkillEntry>): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    globalSkills,
  };
}

describe('isBootstrapContentMissing', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-bootstrap-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('is true when neither USAGE.md exists nor the explain-card entry is configured', () => {
    expect(isBootstrapContentMissing(workspaceRoot, config())).toBe(true);
  });

  it('is true when USAGE.md exists but the explain-card entry is missing', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');

    expect(isBootstrapContentMissing(workspaceRoot, config())).toBe(true);
  });

  it('is true when the explain-card entry exists but USAGE.md is missing', () => {
    const withEntry = config({ [EXPLAIN_CARD_SKILL_ID]: { path: EXPLAIN_CARD_SKILL_RELATIVE_PATH } });

    expect(isBootstrapContentMissing(workspaceRoot, withEntry)).toBe(true);
  });

  it('is false once both USAGE.md exists and the explain-card entry is configured', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');
    const withEntry = config(ensureExplainCardGlobalSkill(undefined));

    expect(isBootstrapContentMissing(workspaceRoot, withEntry)).toBe(false);
  });
});
