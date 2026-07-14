import { describe, it, expect } from 'vitest';
import { buildReadCommand } from './buildReadCommand';

describe('buildReadCommand', () => {
  it('builds the read instruction with a forward-slash path', () => {
    expect(buildReadCommand('.kanbrain/generated/482-x.md')).toBe(
      'Leia o arquivo .kanbrain/generated/482-x.md e siga as instruções nele.',
    );
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(buildReadCommand('.kanbrain\\generated\\482-x.md')).toBe(
      'Leia o arquivo .kanbrain/generated/482-x.md e siga as instruções nele.',
    );
  });
});
