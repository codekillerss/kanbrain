import { describe, it, expect, vi } from 'vitest';
import { ensureAzureSession, hasCachedAzureSession, connectAzureSession, AZURE_DEVOPS_SCOPE } from './ensureAzureSession';

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

describe('hasCachedAzureSession', () => {
  it('returns true when a session is already cached, without prompting', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'abc123' });

    const result = await hasCachedAzureSession(getSession);

    expect(result).toBe(true);
    expect(getSession).toHaveBeenCalledWith([AZURE_DEVOPS_SCOPE], { createIfNone: false });
  });

  it('returns false when there is no cached session', async () => {
    const getSession = vi.fn().mockResolvedValue(undefined);

    const result = await hasCachedAzureSession(getSession);

    expect(result).toBe(false);
  });
});

describe('connectAzureSession', () => {
  it('forces the account picker and returns the access token', async () => {
    const getSession = vi.fn().mockResolvedValue({ accessToken: 'xyz789' });

    const token = await connectAzureSession(getSession);

    expect(token).toBe('xyz789');
    expect(getSession).toHaveBeenCalledWith([AZURE_DEVOPS_SCOPE], { createIfNone: true, clearSessionPreference: true });
  });

  it('throws a descriptive error when the session is undefined', async () => {
    const getSession = vi.fn().mockResolvedValue(undefined);

    await expect(connectAzureSession(getSession)).rejects.toThrow(/login/i);
  });
});
