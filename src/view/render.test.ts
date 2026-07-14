import { describe, it, expect } from 'vitest';
import { render, type RenderState } from './render';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Corrigir <bug> no login',
    description: 'desc',
    status: 'Active',
    type: 'Task',
    url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
    parentId: null,
    childIds: [],
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { Task: 'Tasks' },
  backlogLevels: { Tasks: { Active: 'skills/fix.md', Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('render', () => {
  it('shows an open-folder prompt when there is no workspace folder open', () => {
    const html = render({ hasWorkspace: false, config: null, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('Abra uma pasta de workspace');
  });

  it('shows a setup prompt when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });

  it('escapes HTML in the work item title', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('Corrigir &lt;bug&gt; no login');
    expect(html).not.toContain('Corrigir <bug> no login');
  });

  it('shows a toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Trocar work item');
  });

  it('shows a clear button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('id="kb-clear-btn"');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem({ status: 'Active' }), parent: null, subtasks: [] });
    expect(html).toContain('data-action="run-skill"');
    expect(html).toContain('data-id="482"');
  });

  it('hides the action button when the status has no configured skill', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem({ status: 'Closed' }), parent: null, subtasks: [] });
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('lists children with their own action buttons', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Children (1)');
  });

  it('shows an empty message when there are no children', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('Nenhum item filho');
  });

  it('shows the status as a colored dot next to the plain status text', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem({ status: 'Active' }), parent: null, subtasks: [] });
    expect(html).toContain('kb-status-dot');
    expect(html).toContain('background-color: #b2b2b2');
    expect(html).not.toContain('kb-badge');
  });

  it('shows the type icon and a colored right border instead of a type badge', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem({ type: 'Task' }), parent: null, subtasks: [] });
    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('wraps the search section in an overlay dialog with a close button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('kb-search-overlay');
    expect(html).toContain('kb-search-dialog');
    expect(html).toContain('id="kb-search-close-btn"');
  });
});
