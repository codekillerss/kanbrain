import { describe, it, expect } from 'vitest';
import { buildReadCommand } from './buildReadCommand';

describe('buildReadCommand', () => {
  it('builds the read instruction with a forward-slash path', () => {
    expect(buildReadCommand('.kanbrain/generated/482-x.md')).toBe(
      'Read the file .kanbrain/generated/482-x.md and follow the instructions in it.',
    );
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(buildReadCommand('.kanbrain\\generated\\482-x.md')).toBe(
      'Read the file .kanbrain/generated/482-x.md and follow the instructions in it.',
    );
  });
});
