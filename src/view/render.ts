import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkillPath } from '../config/resolveSkillPath';
import { escapeHtml } from './escapeHtml';
import { renderColoredBadge } from './renderColoredBadge';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
}

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skillPath = resolveSkillPath(config, workItem);
  if (!skillPath) {
    return '';
  }
  const label = skillPath.split('/').pop() ?? skillPath;
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}">▶ ${escapeHtml(label)}</button>`;
}

function renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string {
  return `
    <div class="${cssClass}">
      <div class="kb-card-header">
        <span class="kb-id">#${workItem.id}</span>
        ${renderColoredBadge(workItem.status, config.statusColors?.[workItem.status], 'kb-status')}
        ${renderColoredBadge(workItem.type, config.typeColors?.[workItem.type], 'kb-type', config.typeIcons?.[workItem.type])}
      </div>
      <div class="kb-title">${escapeHtml(workItem.title)}</div>
      ${renderActionButton(workItem, config)}
    </div>
  `;
}

export function render(state: RenderState): string {
  if (!state.hasWorkspace) {
    return '<div class="kb-empty">Abra uma pasta de workspace para usar o Kanbrain.</div>';
  }
  if (!state.config) {
    return '<div class="kb-empty">Nenhum projeto configurado. Rode o comando <b>Kanbrain: Setup</b>.</div>';
  }
  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Buscar por título ou #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }

  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card')).join('')
    : '<div class="kb-empty">Nenhuma subtask.</div>';

  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn">🔍 Trocar work item</button>
      <button id="kb-clear-btn">✕ Limpar</button>
    </div>
    <div id="kb-search-section" class="kb-hidden">
      <input id="kb-search-input" placeholder="Buscar por título ou #id...">
      <div id="kb-search-results"></div>
    </div>
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Subtasks (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
