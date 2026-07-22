import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';
import { escapeHtml } from './escapeHtml';

export function renderConfig(state: RenderState): string {
  const config = state.config!;
  const boardNames = Object.keys(config.cardSettingsByBoard ?? {});
  const boardSelectHtml =
    boardNames.length > 1
      ? `
    <label class="kb-select-row">
      Board (desempate de campos)
      <select id="kb-board-select">
        ${boardNames
          .map(name => `<option value="${escapeHtml(name)}"${name === state.selectedBoard ? ' selected' : ''}>${escapeHtml(name)}</option>`)
          .join('')}
      </select>
    </label>
  `
      : '';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Display</div>
    <label class="kb-checkbox-row">
      <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
      Show assignee in search results
    </label>
    ${boardSelectHtml}
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
