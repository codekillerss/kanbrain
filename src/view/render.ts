import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkillPath } from '../config/resolveSkillPath';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { isValidHexColor, normalizeHex } from './badgeColor';

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
  const typeColor = config.typeColors?.[workItem.type];
  const typeIcon = config.typeIcons?.[workItem.type];
  const borderStyle = typeColor && isValidHexColor(typeColor) ? ` style="border-right: 4px solid ${normalizeHex(typeColor)};"` : '';
  const iconHtml = typeIcon ? `<span class="kb-type-icon">${typeIcon}</span>` : '';

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div class="kb-title">${escapeHtml(workItem.title)}</div>
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
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
    : '<div class="kb-empty">Nenhum item filho.</div>';

  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn">🔍 Trocar work item</button>
      <button id="kb-clear-btn">✕ Limpar</button>
    </div>
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <input id="kb-search-input" placeholder="Buscar por título ou #id...">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div id="kb-search-results"></div>
      </div>
    </div>
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Children (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
