import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';
import { escapeHtml } from './escapeHtml';

function renderHomeFlowActions(state: RenderState): string {
  if (!state.workItem) {
    return '';
  }
  return `
    <div class="kb-section-actions">
      <button id="kb-history-btn" class="kb-icon-btn" title="Work item history">&#8634;</button>
      <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
      <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
    </div>
  `;
}

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;
  const avatars = state.avatars ?? {};

  if (!state.workItem) {
    return `
      <div class="kb-home-commands">
        <button id="kb-toggle-search-btn" class="kb-secondary-btn">🔍 Select Work Item</button>
      </div>
    `;
  }

  return `
    ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, true, null, false, state.selectedTeam)}
    <div class="kb-home-commands">
      <button id="kb-open-flow-btn" class="kb-secondary-btn">➡️ Open Flow</button>
    </div>
  `;
}

function renderHomeTeamSection(state: RenderState): string {
  const config = state.config!;
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  if (teamNames.length === 0) {
    return '';
  }
  const selected = state.selectedTeam ?? config.defaultTeam;

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Team</div>
      <div class="kb-team-card">
        <select id="kb-team-select">
          ${teamNames
            .map(name => `<option value="${escapeHtml(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`)
            .join('')}
        </select>
      </div>
    </div>
  `;
}

function renderHomeProfileSection(state: RenderState): string {
  const config = state.config!;
  const profileIds = Object.keys(config.profiles ?? {});
  if (profileIds.length === 0) {
    return '';
  }
  const selected = config.selectedProfileId ?? '';

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Profile</div>
      <div class="kb-team-card">
        <select id="kb-profile-select">
          <option value=""${selected === '' ? ' selected' : ''}>— None —</option>
          ${profileIds
            .map(id => `<option value="${escapeHtml(id)}"${id === selected ? ' selected' : ''}>${escapeHtml(config.profiles![id].label)}</option>`)
            .join('')}
        </select>
      </div>
    </div>
  `;
}

export function renderHome(state: RenderState): string {
  return `
    <div class="kb-section-card">
      <div class="kb-section-label">
        <span>Flow</span>
        ${renderHomeFlowActions(state)}
      </div>
      ${renderHomeWorkItemSection(state)}
    </div>
    ${renderHomeTeamSection(state)}
    ${renderHomeProfileSection(state)}
  `;
}
