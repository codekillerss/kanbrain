import { describe, it, expect, vi } from 'vitest';
import { validateProjectAccess } from './validateProjectAccess';
import type { AzureDevOpsClient } from './client';

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

  it('returns false, without throwing, when the account has no access', async () => {
    const client = stubClient({ getDefaultTeamName: vi.fn().mockRejectedValue(new Error('404')) });

    const result = await validateProjectAccess(client, 'my-org', 'MyProject');

    expect(result).toBe(false);
  });
});
