import { describe, it, expect, vi } from 'vitest';
import { ensureAzureSession, AZURE_DEVOPS_SCOPE } from './ensureAzureSession';

describe('ensureAzureSession', () => {
  it('returns the access token when a session is granted', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'abc123' });

    const token = await ensureAzureSession(getSession);

    expect(token).toBe('abc123');
    expect(getSession).toHaveBeenCalledWith([AZURE_DEVOPS_SCOPE], { createIfNone: true });
  });

  it('throws a descriptive error when the session is undefined', async () => {
    const getSession = vi.fn().mockResolvedValue(undefined);

    await expect(ensureAzureSession(getSession)).rejects.toThrow(/login/i);
  });
});
