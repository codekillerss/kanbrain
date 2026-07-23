import { describe, it, expect } from 'vitest';
import { buildSetupAssistantContent } from './buildSetupAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function types(overrides: Partial<DiscoveredWorkItemType>[] = []): DiscoveredWorkItemType[] {
  if (overrides.length > 0) {
    return overrides.map(o => ({ name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [], ...o }));
  }
  return [
    { name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] },
  ];
}

describe('buildSetupAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('includes each work item type and status with its category, with no backlog-level grouping', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('### User Story');
    expect(content).toContain('New (Proposed)');
  });

  it('includes each board, column, and state mapping', () => {
    const boards: DiscoveredBoard[] = [
      {
        name: 'MyProject Team Board',
        columns: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed' } }],
      },
    ];
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), boards);

    expect(content).toContain('MyProject Team Board');
    expect(content).toContain('Doing');
    expect(content).toContain('User Story: Committed');
  });

  it('notes when no boards were found', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('No boards were found');
  });

  it('includes all four instructional sections', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('## How Kanbrain works');
    expect(content).toContain('## Important nuance');
    expect(content).toContain("## This project's real configuration");
    expect(content).toContain('## What to do');
  });

  it('is assertive that Kanbrain only supports one skill per status, never per board column', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('one skill per status, per work item type');
    expect(content).not.toContain('ask them how they want Kanbrain to work');
    expect(content).not.toContain('or one skill per board column');
  });

  it('instructs the agent to rename auto-generated labels to the real flow step', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('`label`');
    expect(content).toContain('auto-generated');
  });

  it('instructs the agent to propose labels from the real board column names before asking the user', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('Propose a first draft');
    expect(content).toContain('Boards and columns');
    expect(content).not.toContain('Ask the user what real flow step each status represents');
  });

  it('only falls back to asking the user when a status has no clear column name to infer from', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('Only fall back to asking');
  });

  it('instructs the agent to write real instructions into each skill file using the template placeholders', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('real, useful instructions');
    expect(content).toContain('{{id}}');
    expect(content).toContain('{{subtasks}}');
  });

  it('instructs the agent to delete skill files no longer referenced by the final mapping', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('delete');
    expect(content).toContain('.kanbrain/skills/');
    expect(content).toContain('no longer');
  });
});
