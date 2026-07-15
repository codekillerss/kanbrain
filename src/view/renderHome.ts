import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;
  const toggleLabel = state.workItem ? '🔍 Switch work item' : '🔍 Select Work Item';

  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn" class="kb-secondary-btn">${toggleLabel}</button>
      ${state.workItem ? '<button id="kb-clear-btn" class="kb-secondary-btn">✕ Clear</button>' : ''}
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
    ${
      state.workItem
        ? `${renderWorkItemCard(state.workItem, config, 'kb-main-card')}<button id="kb-view-details-btn" class="kb-secondary-btn">View details →</button>`
        : ''
    }
  `;
}

export function renderHome(state: RenderState): string {
  return `
    <div class="kb-home-section">
      <div class="kb-section-label">Commands</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-secondary-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-secondary-btn">🔄 Sync Board Configuration</button>
        <button id="kb-show-config-btn" class="kb-secondary-btn">🛠️ Configuration</button>
      </div>
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Current Work Item</div>
      ${renderHomeWorkItemSection(state)}
    </div>
  `;
}
