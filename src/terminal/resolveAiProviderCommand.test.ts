import { describe, it, expect } from 'vitest';
import { resolveAiProviderCommand } from './resolveAiProviderCommand';

describe('resolveAiProviderCommand', () => {
  it('uses the project command when the project has an explicit override', () => {
    expect(resolveAiProviderCommand('codex', 'claude')).toBe('codex');
  });

  it('uses the project command even when it is an explicit empty string (forced "no command")', () => {
    expect(resolveAiProviderCommand('', 'claude')).toBe('');
  });

  it('falls back to the default command when the project has no override', () => {
    expect(resolveAiProviderCommand(undefined, 'claude')).toBe('claude');
  });

  it('returns undefined when neither the project nor the default is set', () => {
    expect(resolveAiProviderCommand(undefined, undefined)).toBeUndefined();
  });
});
