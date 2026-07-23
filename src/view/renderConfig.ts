import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';
import { escapeHtml } from './escapeHtml';

export function renderConfig(state: RenderState): string {
  const config = state.config!;
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  const selected = state.selectedTeam ?? config.defaultTeam;
  const teamSelectHtml =
    teamNames.length > 1
      ? `
    <label class="kb-select-row">
      Team
      <select id="kb-team-select">
        ${teamNames
          .map(name => `<option value="${escapeHtml(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`)
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
    ${teamSelectHtml}
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
