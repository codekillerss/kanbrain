import { describe, it, expect } from 'vitest';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from './badgeColor';

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

describe('pickReadableTextColor', () => {
  it('picks black text for a light background', () => {
    expect(pickReadableTextColor('#ffffff')).toBe('#000000');
    expect(pickReadableTextColor('b2b2b2')).toBe('#000000');
  });

  it('picks white text for a dark background', () => {
    expect(pickReadableTextColor('#000000')).toBe('#ffffff');
    expect(pickReadableTextColor('cc293d')).toBe('#ffffff');
  });
});
