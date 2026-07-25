import { describe, it, expect } from 'vitest';
import { EXPLAIN_CARD_SKILL_ID, EXPLAIN_CARD_SKILL_RELATIVE_PATH, ensureExplainCardGlobalSkill } from './bootstrapContent';
import type { SkillEntry } from '../types';

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
