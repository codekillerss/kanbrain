import { describe, it, expect } from 'vitest';
import { render, renderChildrenList, type RenderState } from './render';
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
  skills: { 'skill-1': { path: 'skills/fix.md' } },
  workflowSteps: { Task: { Active: { skillId: 'skill-1' }, Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('render', () => {
  it('shows an open-folder prompt when there is no workspace folder open', () => {
    const html = render({ hasWorkspace: false, extensionVersion: '1.0.0', config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Open a workspace folder');
  });

  it('shows a setup prompt when there is no config', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows a button to run Setup when there is no config', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-run-setup-btn"');
  });

  it('shows an update-the-extension prompt when the config was last synced by a newer version', () => {
    const html = render({
      hasWorkspace: true,
      extensionVersion: '0.11.1',
      config: { ...config, lastSyncedVersion: '0.12.0' },
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
    });

    expect(html).toContain('Update the Kanbrain extension');
    expect(html).toContain('0.12.0');
    expect(html).toContain('0.11.1');
  });

  it('does not show the update-the-extension prompt when running the same or a newer version', () => {
    const same = render({
      hasWorkspace: true,
      extensionVersion: '0.12.0',
      config: { ...config, lastSyncedVersion: '0.12.0' },
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
    });
    const newer = render({
      hasWorkspace: true,
      extensionVersion: '0.13.0',
      config: { ...config, lastSyncedVersion: '0.12.0' },
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
    });

    expect(same).not.toContain('Update the Kanbrain extension');
    expect(newer).not.toContain('Update the Kanbrain extension');
  });

  it('does not show the update-the-extension prompt when lastSyncedVersion was never recorded', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'home' });

    expect(html).not.toContain('Update the Kanbrain extension');
  });

  it('shows the update-the-extension prompt even when connectionStatus is disconnected', () => {
    const html = render({
      hasWorkspace: true,
      extensionVersion: '0.11.1',
      config: { ...config, lastSyncedVersion: '0.12.0' },
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
      connectionStatus: 'disconnected',
    });

    expect(html).toContain('Update the Kanbrain extension');
    expect(html).not.toContain('Kanbrain: Connect to Azure DevOps');
  });

  it('shows a connect prompt when configured but not connected to Azure DevOps', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'home' });

    expect(html).not.toContain('id="kb-run-connect-btn"');
  });

  it('delegates to the home screen when screen is "home"', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'home' });
    expect(html).toContain('>Flow<');
  });

  it('appends the footer on every configured screen', () => {
    for (const screen of ['home', 'flow', 'config', 'brain', 'reviews'] as const) {
      const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen });
      expect(html).toContain('kb-footer');
    }
  });

  it('delegates to the config screen when screen is "config"', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'config' });
    expect(html).toContain('id="kb-run-configure-ai-btn"');
  });

  it('delegates to the brain screen when screen is "brain"', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'brain' });
    expect(html).toContain('data-action="run-segment-ai"');
  });

  it('delegates to the reviews screen when screen is "reviews"', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'reviews' });
    expect(html).toContain('data-action="toggle-reviews-status-filter"');
  });

  it('does not show the search dialog on the reviews screen', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'reviews' });
    expect(html).not.toContain('id="kb-search-input"');
  });

  it('shows a Home button in the footer on the flow screen (there is no per-screen header anymore)', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-home-btn"');
    expect(html).not.toContain('kb-page-header');
  });

  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });

  it('shows an unchecked "Assigned to me" checkbox in the search dialog by default', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    const start = html.indexOf('id="kb-search-assigned-to-me"');
    expect(start).toBeGreaterThan(-1);
    expect(html.slice(start, html.indexOf('>', start))).not.toContain('checked');
  });

  it('checks the "Assigned to me" checkbox when config.searchAssignedToMe is true', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Fix &lt;bug&gt; in login');
    expect(html).not.toContain('Fix <bug> in login');
  });

  it('shows an icon toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('kb-icon-btn');
  });

  it('shows a clear button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-clear-btn"');
  });

  it('merges search and history into a single dialog with two internal tabs', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });

    expect(html).not.toContain('id="kb-history-section"');
    const dialogStart = html.indexOf('id="kb-search-section"');
    const dialogEnd = html.indexOf('id="kb-footer', dialogStart);
    const dialog = html.slice(dialogStart, dialogEnd);

    expect(dialog).toContain('data-action="select-dialog-tab" data-dialog-tab="search"');
    expect(dialog).toContain('data-action="select-dialog-tab" data-dialog-tab="history"');
    expect(dialog).toContain('data-dialog-panel="search"');
    expect(dialog).toContain('data-dialog-panel="history"');
    expect(dialog).toContain('id="kb-history-results"');
  });

  it('no longer renders a dedicated history button on the flow screen', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });

    expect(html).not.toContain('kb-history-btn');
  });

  it('wraps the current work item in a section card with Switch/Clear in the header', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
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
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('kb-section-card kb-section-card-current');
    expect(html).toContain('kb-section-card kb-section-card-children');
  });

  it('keeps the Home button out of the Current Work Item section actions (it lives in the footer)', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    const labelStart = html.indexOf('Current Work Item');
    const labelEnd = html.indexOf('</div>', html.indexOf('kb-section-actions', labelStart));
    const label = html.slice(labelStart, labelEnd);
    expect(label).not.toContain('id="kb-home-btn"');
    expect(label).toContain('id="kb-toggle-search-btn"');
    expect(label).toContain('id="kb-clear-btn"');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Children (1)');
  });

  it('shows a pick button on children cards but not on the main card', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem({ id: 482 }), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="101"');

    const mainCardStart = html.indexOf('kb-main-card');
    const childrenStart = html.indexOf('kb-subtask-card');
    const mainCardHtml = html.slice(mainCardStart, childrenStart);
    expect(mainCardHtml).not.toContain('kb-pick-btn');
  });

  it('shows an empty message when there are no children', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('No child items');
  });

  it('wraps the Children label and list in a bordered section card', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const cardIndex = html.indexOf('kb-section-card');
    const labelIndex = html.indexOf('Children (1)');
    const subtaskIndex = html.indexOf('Sub 1');

    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(labelIndex).toBeGreaterThan(cardIndex);
    expect(subtaskIndex).toBeGreaterThan(labelIndex);
  });

  it('shows a collapse toggle on the Children header when there are children', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const labelIndex = html.indexOf('Children (1)');
    const buttonStart = html.lastIndexOf('<button', labelIndex);
    expect(buttonStart).toBeGreaterThanOrEqual(0);
    const buttonTag = html.slice(buttonStart, html.indexOf('>', buttonStart) + 1);
    expect(buttonTag).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-chevron');
  });

  it('wraps the children list in a container that is the section header\'s next sibling', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const headerStart = html.lastIndexOf('<div class="kb-section-label kb-section-header"', html.indexOf('Children (1)'));
    expect(headerStart).toBeGreaterThanOrEqual(0);
    const headerEnd = html.indexOf('<!-- /kb-section-header -->', headerStart);
    const afterHeader = html.slice(headerEnd + '<!-- /kb-section-header -->'.length).trimStart();
    expect(afterHeader.startsWith('<div class="kb-collapsible-body">')).toBe(true);
  });

  describe('Children sort control', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const flow = (cfg: KanbrainConfig, items: WorkItem[] = subtasks) =>
      render({ hasWorkspace: true, extensionVersion: '1.0.0', config: cfg, workItem: workItem(), parent: null, subtasks: items, screen: 'flow' });
    const optionTag = (html: string, criterion: string) => {
      const index = html.indexOf(`data-criterion="${criterion}"`);
      const start = html.lastIndexOf('<button', index);
      return html.slice(start, html.indexOf('</button>', index));
    };

    it('puts the sort trigger in the Children header, after the label', () => {
      const html = flow(config);
      const labelIndex = html.indexOf('Children (1)');
      const triggerIndex = html.indexOf('data-action="toggle-children-sort"');
      const bodyIndex = html.indexOf('kb-collapsible-body', labelIndex);

      expect(triggerIndex).toBeGreaterThan(labelIndex);
      expect(triggerIndex).toBeLessThan(bodyIndex);
    });

    it('lists the five criteria as menu options, in a fixed order', () => {
      const html = flow(config);
      const positions = ['status', 'backlogLevel', 'workItemType', 'stackRank', 'created'].map(c => html.indexOf(`data-criterion="${c}"`));

      expect(positions.every(p => p > 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(optionTag(html, 'workItemType')).toContain('Work item type');
    });

    it('numbers the selected criteria by priority and shows the count on the trigger', () => {
      const html = flow({ ...config, childrenSortCriteria: ['created', 'status'] });

      expect(optionTag(html, 'created')).toContain('<span class="kb-children-sort-rank">1</span>');
      expect(optionTag(html, 'status')).toContain('<span class="kb-children-sort-rank">2</span>');
      expect(optionTag(html, 'stackRank')).toContain('<span class="kb-children-sort-rank"></span>');
      expect(html).toContain('<span class="kb-children-sort-count">2</span>');
      expect(html).toContain('data-criteria="created,status"');
    });

    it('uses the default criteria when the user never picked any', () => {
      const html = flow(config);

      expect(html).toContain('data-criteria="status,backlogLevel,stackRank,created"');
      expect(html).toContain('<span class="kb-children-sort-count">4</span>');
    });

    it('shows no count and keeps the API order when every criterion is cleared', () => {
      const items = [workItem({ id: 102, title: 'Second', backlogOrder: 2 }), workItem({ id: 101, title: 'First', backlogOrder: 1 })];
      const html = flow({ ...config, childrenSortCriteria: [] }, items);

      expect(html).toContain('data-criteria=""');
      expect(html).not.toContain('kb-children-sort-count');
      expect(html.indexOf('Second')).toBeLessThan(html.indexOf('First'));
    });

    it('applies the chosen criteria to the list', () => {
      const items = [
        workItem({ id: 101, title: 'Newest', createdDate: '2026-03-01T00:00:00Z' }),
        workItem({ id: 102, title: 'Oldest', createdDate: '2026-01-01T00:00:00Z' }),
      ];
      const html = flow({ ...config, childrenSortCriteria: ['created'] }, items);

      expect(html.indexOf('Oldest')).toBeLessThan(html.indexOf('Newest'));
    });

    it('labels the stack rank option "Board position" and explains Stack Rank in its info tooltip', () => {
      const tag = optionTag(flow(config), 'stackRank');

      expect(tag).toContain('Board position');
      expect(tag).not.toContain('>Stack rank<');
      expect(tag).toMatch(/class="kb-children-sort-info"[^>]*title="[^"]*Stack Rank[^"]*"/);
    });

    it('gives every option an info icon with a tooltip', () => {
      const html = flow(config);
      for (const criterion of ['status', 'backlogLevel', 'workItemType', 'stackRank', 'created']) {
        expect(optionTag(html, criterion)).toMatch(/<span class="kb-children-sort-info" title="[^"]+"/);
      }
    });

    it('offers a reset-to-default action carrying the default criteria', () => {
      const html = flow({ ...config, childrenSortCriteria: ['created'] });
      const start = html.indexOf('data-action="reset-children-sort"');
      const tag = html.slice(html.lastIndexOf('<button', start), html.indexOf('>', start) + 1);

      expect(start).toBeGreaterThan(0);
      expect(tag).not.toContain('disabled');
      expect(html).toContain('data-default-criteria="status,backlogLevel,stackRank,created"');
    });

    it('disables the reset action when the criteria already are the default', () => {
      const html = flow(config);
      const start = html.indexOf('data-action="reset-children-sort"');
      const tag = html.slice(html.lastIndexOf('<button', start), html.indexOf('>', start) + 1);

      expect(tag).toContain('disabled');
    });

    it('has no sort trigger when there are no children', () => {
      expect(flow(config, [])).not.toContain('toggle-children-sort');
    });
  });

  describe('renderChildrenList', () => {
    it('renders just the sorted cards, for swapping into the open list without a full rebuild', () => {
      const items = [
        workItem({ id: 101, title: 'Newest', createdDate: '2026-03-01T00:00:00Z' }),
        workItem({ id: 102, title: 'Oldest', createdDate: '2026-01-01T00:00:00Z' }),
      ];
      const html = renderChildrenList(items, { ...config, childrenSortCriteria: ['created'] }, {}, undefined);

      expect(html).not.toContain('Children (');
      expect(html.indexOf('Oldest')).toBeLessThan(html.indexOf('Newest'));
    });

    it('shows the empty message when there are no children', () => {
      expect(renderChildrenList([], config, {}, undefined)).toContain('No child items');
    });
  });

  it('does not show a collapse toggle on the Children header when there are no children', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });

    const labelIndex = html.indexOf('Children (0)');
    expect(labelIndex).toBeGreaterThanOrEqual(0);
    const nearbyHtml = html.slice(Math.max(0, labelIndex - 100), labelIndex);
    expect(nearbyHtml).not.toContain('data-action="toggle-group"');
  });

  it('tags the Children toggle button with data-section="children"', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const labelIndex = html.indexOf('Children (1)');
    const buttonStart = html.lastIndexOf('<button', labelIndex);
    const buttonTag = html.slice(buttonStart, html.indexOf('>', buttonStart) + 1);
    expect(buttonTag).toContain('data-section="children"');
  });

  it('renders the Children body already collapsed when childrenCollapsed is true', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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

  it('renders the Children in sortChildren order (category, backlog level, backlog order)', () => {
    const cfg: KanbrainConfig = {
      ...config,
      statusCategoriesByType: { Task: { Active: 'InProgress', Closed: 'Completed' }, 'User Story': { Active: 'InProgress' } },
      backlogLevelsByTeam: { 'Team B': { 'User Story': 1, Task: 0 } },
    };
    const subtasks = [
      workItem({ id: 101, title: 'Done task', status: 'Closed', backlogOrder: 1 }),
      workItem({ id: 102, title: 'Active task', status: 'Active', backlogOrder: 2 }),
      workItem({ id: 103, title: 'Active story', type: 'User Story', status: 'Active', backlogOrder: 3 }),
    ];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config: cfg, workItem: workItem(), parent: null, subtasks, screen: 'flow', selectedTeam: 'Team B' });

    const positions = ['Active story', 'Active task', 'Done task'].map(title => html.indexOf(title));
    expect(positions.every(p => p > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('marks Children in the Completed state category with the muted class, and only those', () => {
    const cfg: KanbrainConfig = { ...config, statusCategoriesByType: { Task: { Active: 'InProgress', Closed: 'Completed' } } };
    const subtasks = [workItem({ id: 101, status: 'Closed' }), workItem({ id: 102, status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config: cfg, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const cardTagFor = (id: number) => {
      const idIndex = html.indexOf(`#${id}</span>`);
      const start = html.lastIndexOf('<div class="kb-subtask-card', idIndex);
      return html.slice(start, html.indexOf('>', start) + 1);
    };
    expect(cardTagFor(101)).toContain('kb-card-completed');
    expect(cardTagFor(102)).not.toContain('kb-card-completed');
  });

  it('renders the Children body expanded by default when childrenCollapsed is omitted', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

    const bodyStart = html.indexOf('kb-collapsible-body', html.indexOf('Children (1)'));
    const bodyTag = html.slice(html.lastIndexOf('<div', bodyStart), html.indexOf('>', bodyStart) + 1);
    expect(bodyTag).not.toContain('kb-hidden');
  });


  it('shows the status as a colored dot next to the plain status text', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('kb-search-overlay');
    expect(html).toContain('kb-search-dialog');
    expect(html).toContain('id="kb-search-close-btn"');
  });

  it('places the saved-query combobox above the title input inside the search dialog', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-query-filter-input"');
    expect(html).toContain('id="kb-query-clear-btn"');
    expect(html).toContain('id="kb-query-options"');
    expect(html.indexOf('kb-query-combobox')).toBeLessThan(html.indexOf('id="kb-search-input"'));
  });

  it('uses a custom label when the skill entry defines one', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      skills: { 'skill-1': { path: 'skills/fix.md', label: 'Fix it now' } },
    };
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      skills: { 'skill-1': { path: 'skills/fix.md', textColor: 'ffffff', buttonColor: '007acc' } },
    };
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      skills: { 'skill-1': { path: 'skills/fix.md', buttonColor: 'not-a-color' } },
    };
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });

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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
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
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem(),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });

    expect(html).not.toContain('kb-parent-section');
  });

  it('does not show a tab bar when there are no open tabs', () => {
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config, workItem: null, parent: null, subtasks: [], screen: 'home' });
    expect(html).not.toContain('kb-tab-bar');
  });

  it('still shows the tab bar and group bar on the home screen when tabs are already open', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: null,
      parent: null,
      subtasks: [],
      screen: 'home',
      tabs: [{ id: 'tab-1', workItemId: 482 }, { id: 'tab-2', workItemId: 900 }],
      activeTabId: undefined,
    });

    expect(html).toContain('kb-tab-bar');
    expect(html).toContain('data-tab-id="tab-1"');
    expect(html).toContain('data-tab-id="tab-2"');
    expect(html).toContain('kb-group-bar');
  });

  it('shows a tab bar with one tab per open work item', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482 }, { id: 'tab-2', workItemId: 900 }],
      activeTabId: 'tab-1',
    });

    expect(html).toContain('data-tab-id="tab-1"');
    expect(html).toContain('data-tab-id="tab-2"');
    expect(html).toContain('#482');
    expect(html).toContain('#900');
  });

  it('marks the active tab with kb-tab-active', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482 }, { id: 'tab-2', workItemId: 900 }],
      activeTabId: 'tab-2',
    });

    const tab1Start = html.indexOf('data-action="select-tab" data-tab-id="tab-1"');
    const tab1TagStart = html.lastIndexOf('<button', tab1Start);
    const tab2Start = html.indexOf('data-action="select-tab" data-tab-id="tab-2"');
    const tab2TagStart = html.lastIndexOf('<button', tab2Start);
    expect(html.slice(tab1TagStart, html.indexOf('>', tab1TagStart))).not.toContain('kb-tab-active');
    expect(html.slice(tab2TagStart, html.indexOf('>', tab2TagStart))).toContain('kb-tab-active');
  });

  it('shows a custom tab label instead of #id when the tab has one', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482, label: 'My Bug Fix' }],
      activeTabId: 'tab-1',
    });

    const tabBar = html.slice(html.indexOf('kb-tab-bar'), html.indexOf('kb-tab-add'));
    expect(tabBar).toContain('My Bug Fix');
    expect(tabBar).not.toContain('>#482<');
  });

  it('escapes HTML in a custom tab label', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482, label: '<script>evil</script>' }],
      activeTabId: 'tab-1',
    });

    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });

  it('renders a hidden rename input per tab, pre-filled with its current display label', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482, label: 'My Bug Fix' }, { id: 'tab-2', workItemId: 900 }],
      activeTabId: 'tab-1',
    });

    expect(html).toMatch(/<input[^>]*class="kb-tab-rename-input kb-hidden"[^>]*data-tab-id="tab-1"[^>]*value="My Bug Fix"/);
    expect(html).toMatch(/<input[^>]*class="kb-tab-rename-input kb-hidden"[^>]*data-tab-id="tab-2"[^>]*value="#900"/);
  });

  it('shows an enabled add-tab button below the tab limit', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482 }],
      activeTabId: 'tab-1',
    });

    const start = html.indexOf('id="kb-add-tab-btn"');
    expect(start).toBeGreaterThan(-1);
    expect(html.slice(start, html.indexOf('>', start))).not.toContain('disabled');
  });

  it('shows the work item type icon in a tab when its type is known', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482, type: 'Task' }],
      activeTabId: 'tab-1',
    });

    const tabStart = html.indexOf('data-tab-id="tab-1"');
    const tabTagStart = html.lastIndexOf('<button', tabStart);
    const tabTagEnd = html.indexOf('</button>', tabStart);
    expect(html.slice(tabTagStart, tabTagEnd)).toContain('<svg><path d="M0 0"/></svg>');
  });

  it('omits the icon when a tab\'s type has not resolved yet', () => {
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 482 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs: [{ id: 'tab-1', workItemId: 482 }],
      activeTabId: 'tab-1',
    });

    const tabStart = html.indexOf('data-tab-id="tab-1"');
    const tabTagStart = html.lastIndexOf('<button', tabStart);
    const tabTagEnd = html.indexOf('</button>', tabStart);
    expect(html.slice(tabTagStart, tabTagEnd)).not.toContain('<svg>');
  });

  it('disables the add-tab button at the tab limit', () => {
    const tabs = Array.from({ length: 8 }, (_, i) => ({ id: `tab-${i}`, workItemId: i + 1 }));
    const html = render({
      hasWorkspace: true, extensionVersion: '1.0.0',
      config,
      workItem: workItem({ id: 1 }),
      parent: null,
      subtasks: [],
      screen: 'flow',
      tabs,
      activeTabId: 'tab-0',
    });

    const start = html.indexOf('id="kb-add-tab-btn"');
    expect(html.slice(start, html.indexOf('>', start))).toContain('disabled');
  });

  it('shows editable status pickers on the main card, parent card, and subtasks on the flow screen', () => {
    const configWithAssignee: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: true } } } },
    };
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({ hasWorkspace: true, extensionVersion: '1.0.0', config: configWithAssignee, workItem: workItem({ id: 482 }), parent, subtasks, screen: 'flow' });

    expect(html.split('kb-status-picker').length - 1).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain('kb-assignee-picker');
  });
});
