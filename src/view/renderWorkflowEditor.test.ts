import { describe, it, expect } from 'vitest';
import { renderWorkflowEditor } from './renderWorkflowEditor';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    workflowSteps: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('renderWorkflowEditor', () => {
  it('shows an empty message when there are no work item types configured', () => {
    expect(renderWorkflowEditor(config())).toContain('No work item types configured yet.');
  });

  it('renders one row per status with data-level/data-status attributes', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { Task: { 'To Do': null, Done: null } } }));

    expect(html).toContain('data-level="Task"');
    expect(html).toContain('data-status="To Do"');
    expect(html).toContain('data-status="Done"');
  });

  it('selects a visually distinct "no skill" option when the step is null or has no skillId', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { Task: { 'To Do': null } } }));

    expect(html).toContain('<option value="" class="kb-select-none-option" selected>— No skill —</option>');
  });

  it('populates the skill select from the registry and marks the configured one selected', () => {
    const html = renderWorkflowEditor(
      config({
        skills: { 'skill-1': { path: '.kanbrain/skills/task-todo.md', label: 'Refine' } },
        workflowSteps: { Task: { 'To Do': { skillId: 'skill-1' } } },
      }),
    );

    expect(html).toContain('<option value="skill-1" selected>Refine</option>');
  });

  it('fills definitionOfDone and artifacts as newline-joined textarea content', () => {
    const html = renderWorkflowEditor(
      config({
        workflowSteps: {
          Task: { 'To Do': { skillId: null, definitionOfDone: ['Tests passing', 'PR opened'], artifacts: ['Pull request'] } },
        },
      }),
    );

    expect(html).toContain('data-field="definitionOfDone"');
    expect(html).toContain('Tests passing\nPR opened');
    expect(html).toContain('data-field="artifacts"');
    expect(html).toContain('Pull request');
  });

  it('escapes HTML in type, status, and field values', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { '<Task>': { '<To Do>': null } } }));

    expect(html).toContain('&lt;Task&gt;');
    expect(html).toContain('&lt;To Do&gt;');
  });

  it('shows a status dot when a color is known for the status', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { Task: { 'To Do': null } }, statusColors: { 'To Do': 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('renders each type as a collapsible section with a chevron toggle header', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { Task: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-header"');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-chevron');
  });

  it('starts each type body collapsed (kb-hidden) by default', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { Task: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-body kb-hidden"');
  });

  it('shows the type icon and accent color in the group header when configured', () => {
    const html = renderWorkflowEditor(
      config({
        workflowSteps: { Task: { 'To Do': null } },
        typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
        typeColors: { Task: 'f2cb1d' },
      }),
    );

    expect(html).toContain('kb-type-icon');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('omits the icon and accent color when the type has none configured', () => {
    const html = renderWorkflowEditor(config({ workflowSteps: { Task: { 'To Do': null } } }));

    expect(html).not.toContain('kb-type-icon');
    expect(html).not.toContain('border-right');
  });
});
