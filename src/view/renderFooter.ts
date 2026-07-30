import type { RenderState } from './render';
import { renderTypeAccent } from './renderTypeAccent';
import { escapeHtml } from './escapeHtml';

function footerBtnClass(active: boolean): string {
  return active ? 'kb-footer-btn kb-footer-btn-active' : 'kb-footer-btn';
}

export function renderFooter(state: RenderState): string {
  const config = state.config;
  if (!config) {
    return '';
  }

  const workItem = state.workItem;
  const workItemBtn = workItem
    ? `<button id="kb-footer-work-item-btn" class="${footerBtnClass(state.screen === 'flow')}" title="Open Flow — #${workItem.id} ${escapeHtml(workItem.title)}">${renderTypeAccent(workItem.type, config).iconHtml}<span class="kb-footer-work-item-id">#${workItem.id}</span></button>`
    : `<button id="kb-footer-select-work-item-btn" class="kb-footer-btn" title="Select a work item">🔍</button>`;

  return `
    <div class="kb-footer">
      <button id="kb-home-btn" class="${footerBtnClass(state.screen === 'home')}" title="Home">🏠</button>
      <div class="kb-footer-divider"></div>
      ${workItemBtn}
      <button id="kb-show-brain-btn" class="${footerBtnClass(state.screen === 'brain')}" title="Brain">🧠</button>
      <div class="kb-footer-divider"></div>
      <button id="kb-run-check-board-config-btn" class="kb-footer-btn" title="Check Board Configuration">✅</button>
      <button id="kb-run-sync-board-config-btn" class="kb-footer-btn" title="Sync Board Configuration">🔄</button>
      <div class="kb-footer-spacer"></div>
      <button id="kb-show-config-btn" class="${footerBtnClass(state.screen === 'config')}" title="Configuration">⚙️</button>
    </div>
  `;
}
