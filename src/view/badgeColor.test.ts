import { describe, it, expect } from 'vitest';
import { pickReadableTextColor } from './badgeColor';

describe('pickReadableTextColor', () => {
  it('picks black text for a light background color', () => {
    expect(pickReadableTextColor('f0f0f0')).toBe('#000000');
  });

  it('picks white text for a dark background color', () => {
    expect(pickReadableTextColor('1a1a1a')).toBe('#ffffff');
  });

  it('works with a leading #', () => {
    expect(pickReadableTextColor('#f0f0f0')).toBe('#000000');
  });
});
