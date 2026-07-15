import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderConfigEditor } from './renderConfigEditor';

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;

  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }

  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn">✕ Clear</button>
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
    ${renderWorkItemCard(state.workItem, config, 'kb-main-card')}
    <button id="kb-view-details-btn" class="kb-action-btn">View details →</button>
  `;
}

export function renderHome(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-home-section">
      <div class="kb-section-label">Commands</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-action-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-action-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-action-btn">🔄 Sync Board Configuration</button>
      </div>
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Current Work Item</div>
      ${renderHomeWorkItemSection(state)}
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
