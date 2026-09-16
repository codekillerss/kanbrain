import { describe, it, expect } from 'vitest';
import { buildWorkflowAssistantContent } from './buildWorkflowAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';
import type { SkillEntry, WorkflowStepConfig } from '../types';

function types(): DiscoveredWorkItemType[] {
  return [{ name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] }];
}

describe('buildWorkflowAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('scopes the agent to workflow only, never editing the skills registry itself', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('workflow only');
  });

  it('reports the current skill count and instructs stopping to offer configuring skills first when the registry is empty', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('0 skill(s)');
    expect(content).toContain('Configure Skills with AI');
    expect(content).toContain("You don't have any skills configured yet");
  });

  it('reports a nonzero skill count when skills already exist', () => {
    const skills: Record<string, SkillEntry> = { 'skill-1': { path: '.kanbrain/skills/a.md', label: 'Refine' } };
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], skills, {});
    expect(content).toContain('1 skill(s)');
    expect(content).toContain('`skill-1`');
    expect(content).toContain('Refine');
  });

  it('marks a skill as global in the registry listing', () => {
    const skills: Record<string, SkillEntry> = { 'skill-1': { path: 'a.md', isGlobal: true } };
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], skills, {});
    expect(content).toContain('— global');
  });

  it('lists existing workflow steps with the resolved skill label', () => {
    const skills: Record<string, SkillEntry> = { 'skill-1': { path: 'a.md', label: 'Refine' } };
    const workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>> = {
      'User Story': { New: { skillId: 'skill-1', definitionOfDone: ['Tests passing'], artifacts: ['PR'] }, Done: null },
    };
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], skills, workflowSteps);

    expect(content).toContain('New: `skill-1` (Refine), DoD: 1 item(s), artifacts: 1 item(s)');
    expect(content).toContain('Done: _no skill_');
  });

  it('says no workflow steps are configured yet when the map is empty', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('No workflow steps configured yet.');
  });

  it('includes each work item type and status with its category', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('### User Story');
    expect(content).toContain('New (Proposed)');
  });

  it('includes each board, column, and state mapping', () => {
    const boards: DiscoveredBoard[] = [
      { name: 'MyProject Team Board', columns: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed' } }] },
    ];
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), boards, {}, {});
    expect(content).toContain('MyProject Team Board');
    expect(content).toContain('Doing');
  });

  it('mentions Definition of Done and expected artifacts in the instructions', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('Definition of Done');
    expect(content).toContain('artifacts');
  });

  it('instructs presenting the full mapping for confirmation before writing anything', () => {
    const content = buildWorkflowAssistantContent('my-org', 'MyProject', types(), [], {}, {});
    expect(content).toContain('ask them to confirm');
  });
});
