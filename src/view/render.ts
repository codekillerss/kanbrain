import type { WorkItem, KanbrainConfig } from '../types';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skillPath = config.statusSkills[workItem.status];
  if (!skillPath) {
    return '';
  }
  const label = skillPath.split('/').pop() ?? skillPath;
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}">▶ ${esc(label)}</button>`;
}

function renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string {
  return `
    <div class="${cssClass}">
      <div class="kb-card-header">
        <span class="kb-id">#${workItem.id}</span>
        <span class="kb-badge kb-status">${esc(workItem.status)}</span>
        <span class="kb-badge kb-type">${esc(workItem.type)}</span>
      </div>
      <div class="kb-title">${esc(workItem.title)}</div>
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
    return '<div class="kb-empty">Nenhum work item selecionado. Rode o comando <b>Kanbrain: Select Work Item</b>.</div>';
  }

  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card')).join('')
    : '<div class="kb-empty">Nenhuma subtask.</div>';

  return `
    <div class="kb-header">
      <button id="kb-select-btn">Selecionar work item</button>
    </div>
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Subtasks (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
