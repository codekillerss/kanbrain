import { describe, it, expect } from 'vitest';
import { buildProfilesAssistantContent } from './buildProfilesAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';

function types(): DiscoveredWorkItemType[] {
  return [{ name: 'Bug', color: 'b2b2b2', iconSvg: '', states: [] }];
}

describe('buildProfilesAssistantContent', () => {
  it('includes the organization, project, and team', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
    expect(content).toContain('MyProject Team');
  });

  it('lists already configured profiles with id, label, and description', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {
      developer: { label: 'Developer', description: 'I am a developer.' },
    });
    expect(content).toContain('Developer');
    expect(content).toContain('developer');
    expect(content).toContain('I am a developer.');
  });

  it('shows a fallback message when there are no profiles configured yet', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('No profiles configured yet.');
  });

  it('includes the real work item types', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('### Bug');
  });

  it('instructs the agent to confirm with the user before writing anything', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('ask them to confirm before writing anything');
  });

  it('scopes the agent to profiles only', () => {
    const content = buildProfilesAssistantContent('my-org', 'MyProject', 'MyProject Team', types(), {});
    expect(content).toContain('profiles only');
  });
});
