import { describe, it, expect } from 'vitest';
import { renderWorkItemCard } from './renderWorkItemCard';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
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
  workflowSteps: { Task: { Active: { skillId: 'skill-1' } } },
  statusColors: {},
  typeColors: {},
  typeIcons: {},
  cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: true } } } },
};

describe('renderWorkItemCard', () => {
  it('shows the skill action button by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).toContain('data-action="run-skill"');
  });

  it('hides the skill action button when showActionButton is false', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', false);
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('hides the pick button by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-pick-btn');
  });

  it('shows a pick button targeting the item id when showPickButton is true', () => {
    const html = renderWorkItemCard(workItem({ id: 482 }), config, 'kb-subtask-card', true, {}, false, null, false, undefined, true);
    expect(html).toContain('kb-pick-btn');
    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
  });

  it('shows "Unassigned" when the work item has no assignee and the type has AssignedTo enabled', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: null }), config, 'kb-main-card');
    expect(html).toContain('kb-assignee-row');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name when the work item is assigned', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image when one is provided for the assignee', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderWorkItemCard(item, config, 'kb-main-card', true, { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row when cardSettingsByTeam has assignedTo: false for the type', () => {
    const hiddenConfig: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: false } } } },
    };
    const html = renderWorkItemCard(workItem(), hiddenConfig, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-row');
  });

  it('hides the assignee row when cardSettingsByTeam is missing entirely (fail-safe default)', () => {
    const noSettingsConfig: KanbrainConfig = { ...config, cardSettingsByTeam: undefined };
    const html = renderWorkItemCard(workItem(), noSettingsConfig, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-row');
  });

  it('ignores config.showAssignedTo — that toggle only affects the search dialog, not cards', () => {
    const html = renderWorkItemCard(workItem(), { ...config, showAssignedTo: false }, 'kb-main-card');
    expect(html).toContain('kb-assignee-row');
  });

  it('uses the selected team to break a tie when the type appears in more than one team', () => {
    const ambiguousConfig: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: {
        'Team A': { Tasks: { Task: { parent: false, assignedTo: true } } },
        'Team B': { Tasks: { Task: { parent: false, assignedTo: false } } },
      },
    };
    const shown = renderWorkItemCard(workItem(), ambiguousConfig, 'kb-main-card', true, {}, false, null, false, 'Team A');
    const hidden = renderWorkItemCard(workItem(), ambiguousConfig, 'kb-main-card', true, {}, false, null, false, 'Team B');
    expect(shown).toContain('kb-assignee-row');
    expect(hidden).not.toContain('kb-assignee-row');
  });

  it('shows the status row before the assignee row', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');

    const statusIndex = html.indexOf('kb-status-row');
    const assigneeIndex = html.indexOf('kb-assignee-row');

    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(assigneeIndex).toBeGreaterThan(statusIndex);
  });

  it('shows the title next to the id in the card header, not on its own line', () => {
    const html = renderWorkItemCard(workItem({ title: 'Fix bug' }), config, 'kb-main-card');

    const headerStart = html.indexOf('kb-card-header');
    const headerEnd = html.indexOf('</div>', html.indexOf('kb-title', headerStart));
    const header = html.slice(headerStart, headerEnd);

    expect(header).toContain('kb-id');
    expect(header).toContain('Fix bug');
  });

  it('does not make the title clickable by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('data-action="open-work-item-detail"');
    expect(html).not.toContain('kb-title-clickable');
  });

  it('makes the title clickable when clickableTitle is true', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, true);
    expect(html).toContain('class="kb-title kb-title-clickable"');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="482"');
  });

  it('does not show a parent row by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-parent-row');
  });

  it('shows the parent row when parent is provided and showParent is true', () => {
    const parentItem = workItem({ id: 900, title: 'Epic parent' });
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, false, parentItem, true);
    expect(html).toContain('kb-field-label');
    expect(html).toContain('data-id="900"');
    expect(html).toContain('Epic parent');
  });

  it('hides the parent row when showParent is false even if parent is provided', () => {
    const parentItem = workItem({ id: 900 });
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, false, parentItem, false);
    expect(html).not.toContain('kb-field-label');
  });

  it('shows the parent row after the assignee row, so status/assignee read as the card\'s own', () => {
    const parentItem = workItem({ id: 900, title: 'Epic parent' });
    const html = renderWorkItemCard(
      workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }),
      config,
      'kb-main-card',
      true,
      {},
      false,
      parentItem,
      true,
    );

    const statusIndex = html.indexOf('kb-status-row');
    const assigneeIndex = html.indexOf('kb-assignee-row');
    const parentIndex = html.indexOf('kb-field-label');

    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(assigneeIndex).toBeGreaterThan(statusIndex);
    expect(parentIndex).toBeGreaterThan(assigneeIndex);
  });

  it('does not show a Development badge when the work item has no development links', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-dev-badge');
  });

  it('shows a Development badge with the combined count when the work item has development links', () => {
    const item = workItem({
      development: [
        { kind: 'branch', repositoryId: 'repo-1', branchName: 'main' },
        { kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 },
      ],
    });
    const html = renderWorkItemCard(item, config, 'kb-main-card');
    expect(html).toContain('kb-dev-badge');
    expect(html).toContain('>2<');
  });

  it('does not show the global skill trigger when no registry entry is marked global', () => {
    const noGlobalSkills: KanbrainConfig = {
      ...config,
      skills: { 'skill-1': { path: 'skills/fix.md' }, 'skill-2': { path: 'effort.md' } },
    };
    const html = renderWorkItemCard(workItem(), noGlobalSkills, 'kb-main-card');
    expect(html).not.toContain('kb-global-skill-trigger');
    expect(html).not.toContain('kb-global-skill-menu');
  });

  it('shows the global skill trigger and menu with an option per entry marked isGlobal', () => {
    const withGlobalSkill: KanbrainConfig = {
      ...config,
      skills: { 'skill-1': { path: 'skills/fix.md' }, 'skill-2': { path: 'effort.md', label: 'Avaliar Effort', isGlobal: true } },
    };
    const html = renderWorkItemCard(workItem(), withGlobalSkill, 'kb-main-card');
    expect(html).toContain('kb-global-skill-trigger');
    expect(html).toContain('data-action="toggle-global-skill-menu"');
    expect(html).toContain('data-action="run-global-skill"');
    expect(html).toContain('data-skill-id="skill-2"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Avaliar Effort');
  });

  it('excludes non-global entries from the menu even when a global one is also present', () => {
    const mixed: KanbrainConfig = {
      ...config,
      skills: { 'skill-1': { path: 'skills/fix.md' }, 'skill-2': { path: 'effort.md', label: 'Avaliar Effort', isGlobal: true } },
    };
    const html = renderWorkItemCard(workItem(), mixed, 'kb-main-card');
    expect(html).not.toContain('data-skill-id="skill-1"');
  });

  it('shows the global skill trigger even when the card has no status skill', () => {
    const noStatusSkill: KanbrainConfig = {
      ...config,
      workflowSteps: { Task: { Active: null } },
      skills: { 'skill-2': { path: 'effort.md', label: 'Avaliar Effort', isGlobal: true } },
    };
    const html = renderWorkItemCard(workItem(), noStatusSkill, 'kb-main-card');
    expect(html).not.toContain('data-action="run-skill"');
    expect(html).toContain('data-action="run-global-skill"');
  });

  it('shows a disabled placeholder button when the status has no skill but a global entry exists', () => {
    const noStatusSkill: KanbrainConfig = {
      ...config,
      workflowSteps: { Task: { Active: null } },
      skills: { 'skill-2': { path: 'effort.md', label: 'Avaliar Effort', isGlobal: true } },
    };
    const html = renderWorkItemCard(workItem(), noStatusSkill, 'kb-main-card');
    expect(html).toContain('kb-action-btn-placeholder');
    expect(html).toContain('disabled');
  });

  it('renders no action group at all when there is neither a status skill nor any global entries', () => {
    const noSkillsAtAll: KanbrainConfig = { ...config, workflowSteps: { Task: { Active: null } }, skills: {} };
    const html = renderWorkItemCard(workItem(), noSkillsAtAll, 'kb-main-card');
    expect(html).not.toContain('kb-action-group');
    expect(html).not.toContain('kb-action-btn-placeholder');
  });

  it('keeps the plain read-only status row when editable is false (default)', () => {
    const html = renderWorkItemCard(workItem({ status: 'Active' }), config, 'kb-main-card');
    expect(html).not.toContain('kb-status-picker');
    expect(html).toContain('<div class="kb-status-row">');
  });

  it('shows a status picker with one option per known status for the type when editable is true', () => {
    const withTwoStatuses: KanbrainConfig = {
      ...config,
      workflowSteps: { Task: { Active: { skillId: 'skill-1' }, Closed: null } },
      statusColors: { Active: 'b2b2b2', Closed: '339933' },
    };
    const html = renderWorkItemCard(workItem({ id: 482, status: 'Active', type: 'Task' }), withTwoStatuses, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    expect(html).toContain('kb-status-picker');
    expect(html).toContain('data-action="toggle-status-picker"');
    expect(html).toContain('data-action="select-status" data-id="482" data-status="Active"');
    expect(html).toContain('data-action="select-status" data-id="482" data-status="Closed"');
  });

  it('marks the current status option as active in the picker', () => {
    const withTwoStatuses: KanbrainConfig = {
      ...config,
      workflowSteps: { Task: { Active: { skillId: 'skill-1' }, Closed: null } },
    };
    const html = renderWorkItemCard(workItem({ status: 'Closed', type: 'Task' }), withTwoStatuses, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    const closedStart = html.indexOf('data-status="Closed"');
    const closedTagStart = html.lastIndexOf('<button', closedStart);
    const activeStart = html.indexOf('data-status="Active"');
    const activeTagStart = html.lastIndexOf('<button', activeStart);
    expect(html.slice(closedTagStart, html.indexOf('>', closedTagStart))).toContain('kb-status-picker-option-active');
    expect(html.slice(activeTagStart, html.indexOf('>', activeTagStart))).not.toContain('kb-status-picker-option-active');
  });

  it('renders an empty status picker menu (no crash) when the type has no known statuses', () => {
    const noStatuses: KanbrainConfig = { ...config, workflowSteps: {} };
    const html = renderWorkItemCard(workItem({ type: 'Bug' }), noStatuses, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    expect(html).toContain('kb-status-picker-menu');
  });

  it('keeps the plain read-only assignee row when editable is false (default)', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }), config, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-picker');
    expect(html).toContain('kb-assignee-row');
  });

  it('shows an assignee picker with the current assignee, a search input, and an Unassigned option when editable is true', () => {
    const html = renderWorkItemCard(
      workItem({ id: 482, assignedTo: { displayName: 'Jane Doe', imageUrl: null } }),
      config,
      'kb-main-card',
      true,
      {},
      false,
      null,
      false,
      undefined,
      false,
      true,
    );

    expect(html).toContain('class="kb-assignee-picker" data-id="482"');
    expect(html).toContain('data-action="toggle-assignee-picker"');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('class="kb-input kb-assignee-search-input"');
    expect(html).toContain('data-action="select-assignee" data-id="482" data-unique-name=""');
    expect(html).toContain('kb-assignee-picker-results');
  });

  it('shows "Unassigned" as the trigger label when there is no assignee and editable is true', () => {
    const html = renderWorkItemCard(workItem({ assignedTo: null }), config, 'kb-main-card', true, {}, false, null, false, undefined, false, true);

    expect(html).toContain('Unassigned');
  });

  it('omits the assignee picker entirely when showAssignedTo resolves to false, even if editable is true', () => {
    const hiddenConfig: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Tasks: { Task: { parent: false, assignedTo: false } } } } };
    const html = renderWorkItemCard(workItem(), hiddenConfig, 'kb-main-card', true, {}, false, null, false, 'MyProject Team', false, true);

    expect(html).not.toContain('kb-assignee-picker');
    expect(html).not.toContain('kb-assignee-row');
  });
});
