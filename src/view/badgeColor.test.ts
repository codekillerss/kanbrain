import { describe, it, expect } from 'vitest';
import { isValidHexColor, normalizeHex } from './badgeColor';

describe('isValidHexColor', () => {
  it('accepts a 6-digit hex color with or without a leading #', () => {
    expect(isValidHexColor('cc293d')).toBe(true);
    expect(isValidHexColor('#cc293d')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isValidHexColor('not-a-color')).toBe(false);
    expect(isValidHexColor('')).toBe(false);
  });
});

describe('normalizeHex', () => {
  it('adds a leading # when missing', () => {
    expect(normalizeHex('cc293d')).toBe('#cc293d');
  });

  it('leaves an already-prefixed color unchanged', () => {
    expect(normalizeHex('#cc293d')).toBe('#cc293d');
  });
});
