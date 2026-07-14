import { describe, it, expect } from 'vitest';
import { renderStatusDot } from './renderStatusDot';

describe('renderStatusDot', () => {
  it('renders a colored dot when the status has a known color', () => {
    expect(renderStatusDot('Active', { Active: 'b2b2b2' })).toContain('#b2b2b2');
  });

  it('returns an empty string when the status has no known color', () => {
    expect(renderStatusDot('Active', {})).toBe('');
  });

  it('returns an empty string for a malformed color value', () => {
    expect(renderStatusDot('Active', { Active: 'not-a-color' })).toBe('');
  });
});
