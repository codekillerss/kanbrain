import { describe, it, expect, vi } from 'vitest';
import { validateProjectAccess } from './validateProjectAccess';
import { AzureDevOpsHttpError, type AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{ getDefaultTeamName: () => Promise<string> }> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('validateProjectAccess', () => {
  it('returns true when the account can access the configured project', async () => {
    const client = stubClient();

    const result = await validateProjectAccess(client, 'my-org', 'MyProject');

    expect(result).toBe(true);
  });

  it('returns false, without throwing, when the account has no access (403)', async () => {
    const client = stubClient({ getDefaultTeamName: vi.fn().mockRejectedValue(new AzureDevOpsHttpError(403, '403')) });

    const result = await validateProjectAccess(client, 'my-org', 'MyProject');

    expect(result).toBe(false);
  });

  it('returns false, without throwing, when the session is unauthorized (401)', async () => {
    const client = stubClient({ getDefaultTeamName: vi.fn().mockRejectedValue(new AzureDevOpsHttpError(401, '401')) });

    const result = await validateProjectAccess(client, 'my-org', 'MyProject');

    expect(result).toBe(false);
  });

  it('rethrows transient failures instead of reporting them as no access', async () => {
    const client = stubClient({ getDefaultTeamName: vi.fn().mockRejectedValue(new AzureDevOpsHttpError(503, '503')) });

    await expect(validateProjectAccess(client, 'my-org', 'MyProject')).rejects.toMatchObject({ status: 503 });
  });

  it('rethrows non-HTTP errors (e.g. network failures) instead of reporting them as no access', async () => {
    const client = stubClient({ getDefaultTeamName: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });

    await expect(validateProjectAccess(client, 'my-org', 'MyProject')).rejects.toThrow('fetch failed');
  });
});
