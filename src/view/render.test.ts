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
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: { Task: { Active: { path: 'skills/fix.md' }, Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('render', () => {
  it('shows an open-folder prompt when there is no workspace folder open', () => {
    const html = render({ hasWorkspace: false, config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Open a workspace folder');
  });

  it('shows a setup prompt when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows a button to run Setup when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-run-setup-btn"');
  });

  it('shows a connect prompt when configured but not connected to Azure DevOps', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
      connectionStatus: 'disconnected',
    });

    expect(html).toContain('Kanbrain: Connect to Azure DevOps');
    expect(html).toContain('id="kb-run-connect-btn"');
  });

  it('does not show the connect prompt when connectionStatus is omitted', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'home' });

    expect(html).not.toContain('id="kb-run-connect-btn"');
  });

  it('delegates to the home screen when screen is "home"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'home' });
    expect(html).toContain('>Flow<');
  });

  it('appends the footer on every configured screen', () => {
    for (const screen of ['home', 'flow', 'config', 'brain', 'reviews'] as const) {
      const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen });
      expect(html).toContain('kb-footer');
    }
  });

  it('delegates to the config screen when screen is "config"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'config' });
    expect(html).toContain('id="kb-run-configure-ai-btn"');
  });

  it('delegates to the brain screen when screen is "brain"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'brain' });
    expect(html).toContain('data-action="run-segment-ai"');
  });

  it('delegates to the reviews screen when screen is "reviews"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'reviews' });
    expect(html).toContain('data-action="toggle-reviews-status-filter"');
  });

  it('does not show the search dialog on the reviews screen', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'reviews' });
    expect(html).not.toContain('id="kb-search-input"');
  });

  it('shows a Home button in the footer on the flow screen (there is no per-screen header anymore)', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-home-btn"');
    expect(html).not.toContain('kb-page-header');
  });

  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });

  it('shows an unchecked "Assigned to me" checkbox in the search dialog by default', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    const start = html.indexOf('id="kb-search-assigned-to-me"');
    expect(start).toBeGreaterThan(-1);
    expect(html.slice(start, html.indexOf('>', start))).not.toContain('checked');
  });

  it('checks the "Assigned to me" checkbox when config.searchAssignedToMe is true', () => {
    const html = render({
      hasWorkspace: true,
      config: { ...config, searchAssignedToMe: true },
      workItem: workItem(),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    const start = html.indexOf('id="kb-search-assigned-to-me"');
    expect(html.slice(start, html.indexOf('>', start))).toContain('checked');
  });

  it('also shows the "Assigned to me" checkbox in the inline search box when there is no active work item', () => {
    const html = render({
      hasWorkspace: true,
      config: { ...config, searchAssignedToMe: true },
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    const start = html.indexOf('id="kb-search-assigned-to-me"');
    expect(html.slice(start, html.indexOf('>', start))).toContain('checked');
  });

  it('escapes HTML in the work item title', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Fix &lt;bug&gt; in login');
    expect(html).not.toContain('Fix <bug> in login');
  });

  it('shows an icon toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('kb-icon-btn');
  });

  it('shows a clear button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-clear-btn"');
  });

  it('shows a history button and dialog when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-history-btn"');
    expect(html).toContain('id="kb-history-section"');
    expect(html).toContain('id="kb-history-close-btn" class="kb-dialog-close-btn"');
  });

  it('wraps the current work item in a section card with Switch/Clear in the header', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    const labelStart = html.indexOf('Current Work Item');
    expect(labelStart).toBeGreaterThan(-1);
    const cardStart = html.lastIndexOf('kb-section-card', labelStart);
    expect(cardStart).toBeGreaterThan(-1);
    const labelEnd = html.indexOf('</div>', html.indexOf('kb-section-actions', labelStart));
    const label = html.slice(labelStart, labelEnd);
    expect(label).toContain('id="kb-toggle-search-btn"');
    expect(label).toContain('id="kb-clear-btn"');
    expect(html).not.toContain('kb-card-actions');
    expect(html).not.toContain('kb-card-wrapper');
  });

  it('marks the Current Work Item and Children section cards with their own modifier classes', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('kb-section-card kb-section-card-current');
    expect(html).toContain('kb-section-card kb-section-card-children');
  });

  it('keeps the Home button out of the Current Work Item section actions (it lives in the footer)', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    const labelStart = html.indexOf('Current Work Item');
    const labelEnd = html.indexOf('</div>', html.indexOf('kb-section-actions', labelStart));
    const label = html.slice(labelStart, labelEnd);
    expect(label).not.toContain('id="kb-home-btn"');
    expect(label).toContain('id="kb-toggle-search-btn"');
    expect(label).toContain('id="kb-clear-btn"');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
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
      screen: 'flow',
    });
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('lists children with their own action buttons', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Children (1)');
  });

  it('shows a pick button on children cards but not on the main card', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem({ id: 482 }), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="101"');

    const mainCardStart = html.indexOf('kb-main-card');
    const childrenStart = html.indexOf('kb-subtask-card');
    const mainCardHtml = html.slice(mainCardStart, childrenStart);
    expect(mainCardHtml).not.toContain('kb-pick-btn');
  });

  it('shows an empty message when there are no children', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('No child items');
  });

  it('wraps the Children label and list in a bordered section card', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const cardIndex = html.indexOf('kb-section-card');
    const labelIndex = html.indexOf('Children (1)');
    const subtaskIndex = html.indexOf('Sub 1');

    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(labelIndex).toBeGreaterThan(cardIndex);
    expect(subtaskIndex).toBeGreaterThan(labelIndex);
  });

  it('shows a collapse toggle on the Children header when there are children', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const labelIndex = html.indexOf('Children (1)');
    const buttonStart = html.lastIndexOf('<button', labelIndex);
    expect(buttonStart).toBeGreaterThanOrEqual(0);
    const buttonTag = html.slice(buttonStart, html.indexOf('>', buttonStart) + 1);
    expect(buttonTag).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-chevron');
  });

  it('wraps the children list in a container that is the toggle button\'s next sibling', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const buttonCloseIndex = html.indexOf('</button>', html.indexOf('data-action="toggle-group"'));
    const afterButton = html.slice(buttonCloseIndex + '</button>'.length).trimStart();
    expect(afterButton.startsWith('<div class="kb-collapsible-body">')).toBe(true);
  });

  it('does not show a collapse toggle on the Children header when there are no children', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });

    const labelIndex = html.indexOf('Children (0)');
    expect(labelIndex).toBeGreaterThanOrEqual(0);
    const nearbyHtml = html.slice(Math.max(0, labelIndex - 100), labelIndex);
    expect(nearbyHtml).not.toContain('data-action="toggle-group"');
  });

  it('tags the Children toggle button with data-section="children"', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const labelIndex = html.indexOf('Children (1)');
    const buttonStart = html.lastIndexOf('<button', labelIndex);
    const buttonTag = html.slice(buttonStart, html.indexOf('>', buttonStart) + 1);
    expect(buttonTag).toContain('data-section="children"');
  });

  it('renders the Children body already collapsed when childrenCollapsed is true', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem(),
      parent: null,
      subtasks,
      screen: 'flow',
      childrenCollapsed: true,
    });

    const bodyStart = html.indexOf('kb-collapsible-body', html.indexOf('Children (1)'));
    const bodyTag = html.slice(html.lastIndexOf('<div', bodyStart), html.indexOf('>', bodyStart) + 1);
    expect(bodyTag).toContain('kb-hidden');
  });

  it('renders the Children body expanded by default when childrenCollapsed is omitted', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const bodyStart = html.indexOf('kb-collapsible-body', html.indexOf('Children (1)'));
    const bodyTag = html.slice(html.lastIndexOf('<div', bodyStart), html.indexOf('>', bodyStart) + 1);
    expect(bodyTag).not.toContain('kb-hidden');
  });

  it('shows the status as a colored dot next to the plain status text', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
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
      screen: 'flow',
    });
    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('wraps the search section in an overlay dialog with a close button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('kb-search-overlay');
    expect(html).toContain('kb-search-dialog');
    expect(html).toContain('id="kb-search-close-btn"');
  });

  it('places the saved-query combobox above the title input inside the search dialog', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-query-filter-input"');
    expect(html).toContain('id="kb-query-clear-btn"');
    expect(html).toContain('id="kb-query-options"');
    expect(html.indexOf('kb-query-combobox')).toBeLessThan(html.indexOf('id="kb-search-input"'));
  });

  it('uses a custom label when the skill entry defines one', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      skills: { Task: { Active: { path: 'skills/fix.md', label: 'Fix it now' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('Fix it now');
    expect(html).not.toContain('fix.md');
  });

  it('applies textColor and buttonColor as inline style when valid hex', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      skills: { Task: { Active: { path: 'skills/fix.md', textColor: 'ffffff', buttonColor: '007acc' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('background-color: #007acc;');
    expect(html).toContain('color: #ffffff;');
  });

  it('ignores an invalid hex color and falls back to the theme default', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      skills: { Task: { Active: { path: 'skills/fix.md', buttonColor: 'not-a-color' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    const buttonIndex = html.indexOf('data-action="run-skill"');
    const buttonMarkup = html.slice(buttonIndex - 40, buttonIndex + 40);
    expect(buttonMarkup).not.toContain('background:');
  });

  it('passes avatars through to the main card and subtasks', () => {
    const configWithAssignee: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: true } } } },
    };
    const subtasks = [workItem({ id: 101, assignedTo: { displayName: 'Bob', imageUrl: 'https://example.com/bob.png' } })];
    const html = render({
      hasWorkspace: true,
      config: configWithAssignee,
      workItem: workItem({ assignedTo: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' } }),
      parent: null,
      subtasks,
      screen: 'flow',
      avatars: {
        'https://example.com/jane.png': 'data:image/png;base64,JANE',
        'https://example.com/bob.png': 'data:image/png;base64,BOB',
      },
    });

    expect(html).toContain('data:image/png;base64,JANE');
    expect(html).toContain('data:image/png;base64,BOB');
  });

  it('makes the title clickable on the main card and subtasks in the flow screen', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const occurrences = html.split('kb-title-clickable').length - 1;
    expect(occurrences).toBe(2);
    expect(html).toContain('data-action="open-work-item-detail" data-id="482"');
    expect(html).toContain('data-action="open-work-item-detail" data-id="101"');
  });

  it('shows the parent row on the main card when cardSettingsByTeam enables Parent for the type', () => {
    const configWithParent: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: true, assignedTo: false } } } },
    };
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900, title: 'Epic parent' }),
      subtasks: [],
      screen: 'flow',
    });

    expect(html).toContain('kb-field-label');
    expect(html).toContain('data-id="900"');
  });

  it('does not show the parent row when the type is not enabled in cardSettingsByTeam', () => {
    const configWithParent: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: false, assignedTo: false } } } },
    };
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900 }),
      subtasks: [],
      screen: 'flow',
    });

    expect(html).not.toContain('kb-field-label');
  });

  it('does not show the parent row on subtask cards', () => {
    const configWithParent: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: true, assignedTo: false } } } },
    };
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900 }),
      subtasks,
      screen: 'flow',
    });

    expect(html.split('kb-field-label').length - 1).toBe(1);
  });

  it('shows the parent as a full card on the Flow screen when the item has a parent', () => {
    const parent = workItem({ id: 900, title: 'Epic parent', childIds: [482, 501] });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
    });

    expect(html).toContain('kb-parent-section');
    expect(html).toContain('>Parent</span>');
    const parentSectionStart = html.indexOf('kb-parent-section');
    const parentSectionHtml = html.slice(parentSectionStart, html.indexOf('kb-section-card', parentSectionStart + 1));
    expect(parentSectionHtml).toContain('kb-subtask-card');
    expect(parentSectionHtml).toContain('data-id="900"');
    expect(parentSectionHtml).toContain('Epic parent');
    expect(parentSectionHtml).toContain('data-action="pick-work-item"');
  });

  it('shows a collapse toggle on the Parent header', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
    });

    const labelIndex = html.indexOf('>Parent</span>');
    const buttonStart = html.lastIndexOf('<button', labelIndex);
    expect(buttonStart).toBeGreaterThanOrEqual(0);
    const buttonTag = html.slice(buttonStart, html.indexOf('>', buttonStart) + 1);
    expect(buttonTag).toContain('data-action="toggle-group"');
  });

  it('wraps the parent card in a container that is the toggle button\'s next sibling', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
    });

    const parentSectionStart = html.indexOf('kb-parent-section');
    const buttonCloseIndex = html.indexOf('</button>', parentSectionStart);
    const afterButton = html.slice(buttonCloseIndex + '</button>'.length).trimStart();
    expect(afterButton.startsWith('<div class="kb-collapsible-body">')).toBe(true);
  });

  it('tags the Parent toggle button with data-section="parent"', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
    });

    const labelIndex = html.indexOf('>Parent</span>');
    const buttonStart = html.lastIndexOf('<button', labelIndex);
    const buttonTag = html.slice(buttonStart, html.indexOf('>', buttonStart) + 1);
    expect(buttonTag).toContain('data-section="parent"');
  });

  it('renders the Parent body already collapsed when parentCollapsed is true', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
      parentCollapsed: true,
    });

    const parentSectionStart = html.indexOf('kb-parent-section');
    const bodyStart = html.indexOf('kb-collapsible-body', parentSectionStart);
    const bodyTag = html.slice(html.lastIndexOf('<div', bodyStart), html.indexOf('>', bodyStart) + 1);
    expect(bodyTag).toContain('kb-hidden');
  });

  it('renders the Parent body expanded by default when parentCollapsed is omitted', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
    });

    const parentSectionStart = html.indexOf('kb-parent-section');
    const bodyStart = html.indexOf('kb-collapsible-body', parentSectionStart);
    const bodyTag = html.slice(html.lastIndexOf('<div', bodyStart), html.indexOf('>', bodyStart) + 1);
    expect(bodyTag).not.toContain('kb-hidden');
  });

  it('does not show the parent section when there is no parent', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem(),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });

    expect(html).not.toContain('kb-parent-section');
  });
});
