import { describe, it, expect } from 'vitest';
import { buildSkillsAssistantContent } from './buildSkillsAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function types(): DiscoveredWorkItemType[] {
  return [{ name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] }];
}

describe('buildSkillsAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('includes each work item type and status with its category', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('### User Story');
    expect(content).toContain('New (Proposed)');
  });

  it('includes each board, column, and state mapping', () => {
    const boards: DiscoveredBoard[] = [
      { name: 'MyProject Team Board', columns: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed' } }] },
    ];
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), boards);
    expect(content).toContain('MyProject Team Board');
    expect(content).toContain('Doing');
  });

  it('instructs the agent to run Sync Board Configuration first, before the rest of the steps', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('Kanbrain: Sync Board Configuration');
    expect(content.indexOf('Step 0')).toBeLessThan(content.indexOf('What to do'));
  });

  it('mentions Definition of Done', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('Definition of Done');
  });

  it('scopes the agent to skills only', () => {
    const content = buildSkillsAssistantContent('my-org', 'MyProject', types(), []);
    expect(content).toContain('skills only');
  });
});
