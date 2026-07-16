import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
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
  if (state.screen === 'home') {
    return renderHome(state);
  }
  if (state.screen === 'config') {
    return renderConfig(state);
  }

  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }

  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card')).join('')
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
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
      <div class="kb-card-actions">
        <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
        <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
      </div>
    </div>
    <div class="kb-section-label">Children (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
