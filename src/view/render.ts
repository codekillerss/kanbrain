import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { renderRepositories } from './renderRepositories';
import { resolveShowParent } from '../config/resolveCardFieldVisibility';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config' | 'repositories';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedTeam?: string;
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
  if (state.connectionStatus === 'disconnected') {
    return `
      <div class="kb-empty">
        This project is configured, but not connected to Azure DevOps yet. Run the <b>Kanbrain: Connect to Azure DevOps</b> command.
        <div><button id="kb-run-connect-btn" class="kb-action-btn">Run Kanbrain: Connect to Azure DevOps</button></div>
      </div>
    `;
  }
  if (state.screen === 'home') {
    return renderHome(state);
  }
  if (state.screen === 'config') {
    return renderConfig(state);
  }
  if (state.screen === 'repositories') {
    return renderRepositories(state);
  }

  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }

  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const parentSectionHtml = state.parent
    ? `
    <div class="kb-section-card kb-parent-section">
      <div class="kb-section-label">Parent</div>
      ${renderWorkItemCard(state.parent, state.config, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true)}
    </div>
  `
    : '';
  const subtasksHtml = state.subtasks.length
    ? state.subtasks
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, true))
        .join('')
    : '<div class="kb-empty">No child items.</div>';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <input id="kb-search-input" placeholder="Search by title or #id...">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div id="kb-search-results"></div>
      </div>
    </div>
    ${parentSectionHtml}
    <div class="kb-section-card kb-section-card-current">
      <div class="kb-section-label">
        <span>Current Work Item</span>
        <div class="kb-section-actions">
          <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
          <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
        </div>
      </div>
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam)}
    </div>
    <div class="kb-section-card kb-section-card-children">
      <div class="kb-section-label">Children (${state.subtasks.length})</div>
      ${subtasksHtml}
    </div>
  `;
}
