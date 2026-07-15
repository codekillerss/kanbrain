import { describe, it, expect } from 'vitest';
import { render, type RenderState } from './render';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix <bug> in login',
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
  backlogLevels: { Tasks: { Active: { path: 'skills/fix.md' }, Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('render', () => {
  it('shows an open-folder prompt when there is no workspace folder open', () => {
    const html = render({ hasWorkspace: false, config: null, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('Open a workspace folder');
  });

  it('shows a setup prompt when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows a button to run Setup when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-run-setup-btn"');
  });

  it('delegates to the home screen when showHome is true', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], showHome: true });
    expect(html).toContain('kb-home-section');
  });

  it('shows a Home button on the focused screen', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-home-btn"');
  });

  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });

  it('escapes HTML in the work item title', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('Fix &lt;bug&gt; in login');
    expect(html).not.toContain('Fix <bug> in login');
  });

  it('shows a toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Switch work item');
  });

  it('shows a clear button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-clear-btn"');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    expect(html).toContain('data-action="run-skill"');
    expect(html).toContain('data-id="482"');
  });

  it('hides the action button when the status has no configured skill', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Closed' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('lists children with their own action buttons', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, showHome: false });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Children (1)');
  });

  it('shows an empty message when there are no children', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('No child items');
  });

  it('shows the status as a colored dot next to the plain status text', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    expect(html).toContain('kb-status-dot');
    expect(html).toContain('background-color: #b2b2b2');
    expect(html).not.toContain('kb-badge');
  });

  it('shows the type icon and a colored right border instead of a type badge', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ type: 'Task' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('wraps the search section in an overlay dialog with a close button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('kb-search-overlay');
    expect(html).toContain('kb-search-dialog');
    expect(html).toContain('id="kb-search-close-btn"');
  });

  it('uses a custom label when the skill entry defines one', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', label: 'Fix it now' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    expect(html).toContain('Fix it now');
    expect(html).not.toContain('fix.md');
  });

  it('applies textColor and buttonColor as inline style when valid hex', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', textColor: 'ffffff', buttonColor: '007acc' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    expect(html).toContain('background: #007acc;');
    expect(html).toContain('color: #ffffff;');
  });

  it('ignores an invalid hex color and falls back to the theme default', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', buttonColor: 'not-a-color' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
    });
    const buttonIndex = html.indexOf('data-action="run-skill"');
    const buttonMarkup = html.slice(buttonIndex - 40, buttonIndex + 40);
    expect(buttonMarkup).not.toContain('background:');
  });
});
