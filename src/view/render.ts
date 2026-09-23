import type { WorkItem, KanbrainConfig, PullRequestSummary } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { renderBrain } from './renderBrain';
import { renderReviews } from './renderReviews';
import { renderFooter } from './renderFooter';
import { resolveShowParent } from '../config/resolveCardFieldVisibility';
import { isExtensionOutdated } from '../config/compareVersions';
import { renderTypeAccent } from './renderTypeAccent';
import { DEFAULT_GROUP_ID, MAX_GROUP_NAME_LENGTH, MAX_TABS, tabsInGroup, type TabGroup, type WorkItemTab } from './tabs';
import { escapeHtml } from './escapeHtml';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  extensionVersion: string;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config' | 'brain' | 'reviews';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedTeam?: string;
  parentCollapsed?: boolean;
  childrenCollapsed?: boolean;
  openBrainSegment?: 'repositories' | 'skills' | 'workflow' | 'profiles' | null;
  reviewsPullRequests?: PullRequestSummary[];
  reviewsStatusFilters?: ('active' | 'completed' | 'abandoned')[];
  reviewsOwnerFilter?: 'all' | 'mine' | 'assigned' | 'fixed' | 'needsMyFix';
  reviewsFetchFailedCount?: number;
  tabs?: WorkItemTab[];
  activeTabId?: string;
  defaultAiProviderCommand?: string;
  groups?: TabGroup[];
  activeGroupId?: string;
  pendingGroupRenameId?: string;
}

function renderTabBar(tabs: WorkItemTab[], activeGroupId: string, activeTabId: string | undefined, config: KanbrainConfig): string {
  const groupTabs = tabsInGroup(tabs, activeGroupId);
  if (groupTabs.length === 0) {
    return '';
  }
  const tabsHtml = groupTabs
    .map(tab => {
      const iconHtml = tab.type ? renderTypeAccent(tab.type, config).iconHtml : '';
      const label = tab.label ?? `#${tab.workItemId}`;
      return `
      <div class="kb-tab-wrap" draggable="true">
        <button type="button" class="kb-tab${tab.id === activeTabId ? ' kb-tab-active' : ''}" data-action="select-tab" data-tab-id="${tab.id}">
          ${iconHtml}
          <span class="kb-tab-label" data-action="rename-tab-trigger" data-tab-id="${tab.id}">${escapeHtml(label)}</span>
          <span class="kb-tab-close" data-action="close-tab" data-tab-id="${tab.id}" title="Close tab" aria-label="Close tab">&#10005;</span>
        </button>
        <input type="text" class="kb-tab-rename-input kb-hidden" data-tab-id="${tab.id}" value="${escapeHtml(label)}">
      </div>`;
    })
    .join('');
  const atLimit = groupTabs.length >= MAX_TABS;
  return `
    <div class="kb-tab-bar">
      ${tabsHtml}
      <button type="button" id="kb-add-tab-btn" class="kb-tab-add" title="${atLimit ? `Up to ${MAX_TABS} tabs at once` : 'Open a work item in a new tab'}"${atLimit ? ' disabled' : ''}>+</button>
    </div>
  `;
}

function renderGroupBar(groups: TabGroup[], activeGroupId: string, pendingGroupRenameId: string | undefined): string {
  const groupsHtml = groups
    .map(group => {
      const isActive = group.id === activeGroupId;
      const isRenaming = group.id === pendingGroupRenameId;
      const isDefault = group.id === DEFAULT_GROUP_ID;
      const closeHtml = isDefault
        ? `<span class="kb-group-pill-lock" title="The default group can't be removed" aria-label="Default group, can't be removed">&#128274;</span>`
        : `<span class="kb-group-pill-close" data-action="remove-group" data-group-id="${group.id}" title="Remove group" aria-label="Remove group">&#10005;</span>`;
      return `
      <div class="kb-group-pill-wrap" draggable="${isDefault ? 'false' : 'true'}" data-group-id="${group.id}">
        <button type="button" class="kb-group-pill${isActive ? ' kb-group-pill-active' : ''}" data-action="select-group" data-group-id="${group.id}" style="--kb-group-color: ${group.color}">
          <span class="kb-group-pill-label" data-action="rename-group-trigger" data-group-id="${group.id}">${escapeHtml(group.name)}</span>
          ${closeHtml}
        </button>
        <input type="text" class="kb-group-rename-input${isRenaming ? '' : ' kb-hidden'}" data-group-id="${group.id}" value="${escapeHtml(group.name)}" maxlength="${MAX_GROUP_NAME_LENGTH}">
      </div>`;
    })
    .join('');
  return `
    <div class="kb-group-bar" title="Tab groups">
      ${groupsHtml}
      <button type="button" class="kb-group-add" data-action="add-group" title="New group">+</button>
    </div>
  `;
}

function renderSearchTabsContent(config: KanbrainConfig, closable: boolean): string {
  const closeButtonHtml = closable ? `<button id="kb-search-close-btn">✕</button>` : '';
  return `
    <div class="kb-search-dialog-header">
      <div class="kb-dialog-tabs">
        <button type="button" class="kb-dialog-tab kb-dialog-tab-active" data-action="select-dialog-tab" data-dialog-tab="search">Search</button>
        <button type="button" class="kb-dialog-tab" data-action="select-dialog-tab" data-dialog-tab="history">History</button>
      </div>
      ${closeButtonHtml}
    </div>

    <div class="kb-dialog-panel" data-dialog-panel="search">
      <div class="kb-query-combobox">
        <div id="kb-query-trigger" class="kb-query-trigger">
          <span id="kb-query-trigger-label" class="kb-query-trigger-label kb-query-trigger-placeholder">Filter by saved query...</span>
        </div>
        <button id="kb-query-clear-btn" class="kb-query-clear-btn kb-hidden" title="Clear query" aria-label="Clear query">✕</button>
        <span id="kb-query-combobox-icon" class="kb-query-combobox-icon" aria-hidden="true">▼</span>
        <div id="kb-query-options" class="kb-query-dropdown kb-hidden">
          <input id="kb-query-filter-input" placeholder="Filter by saved query..." autocomplete="off">
          <div id="kb-query-options-list"></div>
        </div>
      </div>
      <input id="kb-search-input" placeholder="Search by title or #id...">
      <div class="kb-search-filters-row">
        <label class="kb-checkbox-row">
          <input type="checkbox" id="kb-search-assigned-to-me" ${config.searchAssignedToMe ? 'checked' : ''}>
          Assigned to me
        </label>
      </div>
      <div id="kb-search-results"></div>
    </div>

    <div class="kb-dialog-panel kb-hidden" data-dialog-panel="history">
      <div id="kb-history-results"><div class="kb-empty">Loading...</div></div>
    </div>
  `;
}

// Used when a work item is already active — a real overlay/modal on top of it, hidden until
// "Switch work item" is clicked.
function renderSearchDialog(config: KanbrainConfig): string {
  return `
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        ${renderSearchTabsContent(config, true)}
      </div>
    </div>
  `;
}

// Used when there's no active work item (e.g. an empty group) — plain page content, not a
// modal, but with the same Search/History tabs the overlay above uses.
function renderInlineSearch(config: KanbrainConfig): string {
  return `
    <div id="kb-search-section" class="kb-search-dialog">
      ${renderSearchTabsContent(config, false)}
    </div>
  `;
}

export function render(state: RenderState): string {
  if (!state.hasWorkspace) {
    return '<div class="kb-empty">Open a workspace folder to use Kanbrain.</div>';
  }
  if (!state.config) {
    return `
      <div class="kb-empty">
        No project configured. Run the <b>Kanbrain: Setup</b> command.
        <div><button id="kb-run-setup-btn" class="kb-action-btn">Run Kanbrain: Setup</button></div>
      </div>
    `;
  }
  if (isExtensionOutdated(state.extensionVersion, state.config.lastSyncedVersion)) {
    return `
      <div class="kb-empty">
        This project was last configured with a newer version of Kanbrain (v${state.config.lastSyncedVersion}) than the one currently running (v${state.extensionVersion}). Update the Kanbrain extension to avoid configuration issues.
      </div>
    `;
  }
  if (state.connectionStatus === 'disconnected') {
    return `
      <div class="kb-empty">
        This project is configured, but not connected to Azure DevOps yet. Run the <b>Kanbrain: Connect to Azure DevOps</b> command.
        <div><button id="kb-run-connect-btn" class="kb-action-btn">Run Kanbrain: Connect to Azure DevOps</button></div>
      </div>
    `;
  }
  if (state.screen === 'home') {
    return `${renderHome(state)}${renderSearchDialog(state.config)}${renderFooter(state)}`;
  }
  if (state.screen === 'config') {
    return `${renderConfig(state)}${renderSearchDialog(state.config)}${renderFooter(state)}`;
  }
  if (state.screen === 'brain') {
    return `${renderBrain(state)}${renderSearchDialog(state.config)}${renderFooter(state)}`;
  }
  if (state.screen === 'reviews') {
    return `${renderReviews(state)}${renderFooter(state)}`;
  }

  const groups = state.groups ?? [];
  const activeGroupId = state.activeGroupId ?? DEFAULT_GROUP_ID;
  const tabBarHtml = renderTabBar(state.tabs ?? [], activeGroupId, state.activeTabId, state.config);
  const groupBarHtml = (state.tabs ?? []).length > 0 ? renderGroupBar(groups, activeGroupId, state.pendingGroupRenameId) : '';

  if (!state.workItem) {
    return `
      ${groupBarHtml}
      ${renderInlineSearch(state.config)}
      ${tabBarHtml}
      ${renderFooter(state)}
    `;
  }

  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const parentSectionHtml = state.parent
    ? `
    <div class="kb-section-card kb-parent-section">
      <button type="button" class="kb-section-label" data-action="toggle-group" data-section="parent"><span><span class="kb-chevron">▾</span>Parent</span></button>
      <div class="kb-collapsible-body${state.parentCollapsed ? ' kb-hidden' : ''}">
        ${renderWorkItemCard(state.parent, state.config, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true, true)}
      </div>
    </div>
  `
    : '';
  const subtasksHtml = state.subtasks.length
    ? state.subtasks
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true, true))
        .join('')
    : '<div class="kb-empty">No child items.</div>';

  return `
    ${groupBarHtml}
    ${renderSearchDialog(state.config)}
    ${parentSectionHtml}
    <div class="kb-section-card kb-section-card-current">
      <div class="kb-section-label">
        <span>Current Work Item</span>
        <div class="kb-section-actions">
          <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
        </div>
      </div>
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam, false, true)}
    </div>
    <div class="kb-section-card kb-section-card-children">
      ${
        state.subtasks.length
          ? `<button type="button" class="kb-section-label" data-action="toggle-group" data-section="children"><span><span class="kb-chevron">▾</span>Children (${state.subtasks.length})</span></button>`
          : `<div class="kb-section-label">Children (${state.subtasks.length})</div>`
      }
      <div class="kb-collapsible-body${state.childrenCollapsed ? ' kb-hidden' : ''}">${subtasksHtml}</div>
    </div>
    ${tabBarHtml}
    ${renderFooter(state)}
  `;
}
