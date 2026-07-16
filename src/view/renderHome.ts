import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;

  const searchDialog = `
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <input id="kb-search-input" placeholder="Search by title or #id...">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div id="kb-search-results"></div>
      </div>
    </div>
  `;

  if (!state.workItem) {
    return `
      <div class="kb-home-commands">
        <button id="kb-toggle-search-btn" class="kb-secondary-btn">🔍 Select Work Item</button>
      </div>
      ${searchDialog}
    `;
  }

  return `
    ${searchDialog}
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false)}
      <div class="kb-card-actions">
        <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
        <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
      </div>
    </div>
    <button id="kb-view-details-btn" class="kb-secondary-btn">View details →</button>
  `;
}

export function renderHome(state: RenderState): string {
  return `
    <div class="kb-home-section">
      <div class="kb-section-label">Flow</div>
      ${renderHomeWorkItemSection(state)}
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Commands</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-secondary-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-secondary-btn">🔄 Sync Board Configuration</button>
      </div>
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Configuration</div>
      <div class="kb-home-commands">
        <button id="kb-show-config-btn" class="kb-secondary-btn">🛠️ Configuration</button>
      </div>
    </div>
  `;
}
