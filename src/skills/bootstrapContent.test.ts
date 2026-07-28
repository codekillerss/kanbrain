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
  DEFAULT_PROFILES,
  ensureDefaultProfiles,
} from './bootstrapContent';
import type { KanbrainConfig, SkillEntry, ProfileEntry } from '../types';

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

describe('ensureDefaultProfiles', () => {
  it('creates developer and qa when there is no existing map', () => {
    const result = ensureDefaultProfiles(undefined);
    expect(result).toEqual(DEFAULT_PROFILES);
  });

  it('preserves a customized default entry and adds only the missing one', () => {
    const existing: Record<string, ProfileEntry> = { developer: { label: 'Dev Custom', description: 'Customized.' } };
    const result = ensureDefaultProfiles(existing);

    expect(result.developer).toEqual({ label: 'Dev Custom', description: 'Customized.' });
    expect(result.qa).toEqual(DEFAULT_PROFILES.qa);
  });

  it('keeps a custom, non-default profile untouched', () => {
    const existing: Record<string, ProfileEntry> = {
      ...DEFAULT_PROFILES,
      intern: { label: 'Intern', description: 'I am an intern.' },
    };
    const result = ensureDefaultProfiles(existing);
    expect(result.intern).toEqual({ label: 'Intern', description: 'I am an intern.' });
  });

  it('changes nothing when both defaults are already present', () => {
    const result = ensureDefaultProfiles({ ...DEFAULT_PROFILES });
    expect(result).toEqual(DEFAULT_PROFILES);
  });
});

function config(globalSkills?: Record<string, SkillEntry>, profiles?: Record<string, ProfileEntry>): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    globalSkills,
    profiles,
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

  it('is false once USAGE.md exists, the explain-card entry, and the default profiles are all configured', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');
    const withEntry = config(ensureExplainCardGlobalSkill(undefined), ensureDefaultProfiles(undefined));

    expect(isBootstrapContentMissing(workspaceRoot, withEntry)).toBe(false);
  });

  it('is true when USAGE.md and the explain-card entry are present but a default profile is missing', () => {
    fs.mkdirSync(path.join(workspaceRoot, '.kanbrain'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH), '# guide', 'utf-8');
    const withPartialProfiles = config(ensureExplainCardGlobalSkill(undefined), { developer: DEFAULT_PROFILES.developer });

    expect(isBootstrapContentMissing(workspaceRoot, withPartialProfiles)).toBe(true);
  });
});
