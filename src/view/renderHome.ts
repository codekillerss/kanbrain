import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';
import { escapeHtml } from './escapeHtml';
import { AI_PROVIDER_PRESETS, matchAiProviderPreset } from './aiProviderPresets';

function renderHomeFlowActions(state: RenderState): string {
  if (!state.workItem) {
    return '';
  }
  return `
    <div class="kb-section-actions">
      <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
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

function renderHomeTerminalSection(state: RenderState): string {
  const config = state.config!;
  const defaultCommand = state.defaultAiProviderCommand ?? '';
  const defaultPresetId = matchAiProviderPreset(defaultCommand)?.id;

  const hasOverride = config.aiProviderCommand !== undefined;
  const effective = hasOverride ? config.aiProviderCommand! : defaultCommand;
  const matchedPreset = matchAiProviderPreset(effective);
  const selectedValue = effective === '' ? 'none' : matchedPreset ? matchedPreset.id : 'custom';
  const customValue = selectedValue === 'custom' ? effective : '';

  // Custom has no fixed command of its own, so it's the default option only when the box
  // currently shows exactly the default's command — i.e. the default is itself a custom
  // command and the project isn't overriding it with a different one.
  const defaultIsCustom = defaultCommand !== '' && defaultPresetId === undefined;
  const customIsDefault = defaultIsCustom && selectedValue === 'custom' && effective === defaultCommand;

  const options = [
    `<option value="none" data-command=""${selectedValue === 'none' ? ' selected' : ''}>None — force no command for this project${defaultCommand === '' ? ' (default)' : ''}</option>`,
    ...AI_PROVIDER_PRESETS.map(
      p =>
        `<option value="${p.id}" data-command="${escapeHtml(p.command)}"${selectedValue === p.id ? ' selected' : ''}>${escapeHtml(p.label)}${p.id === defaultPresetId ? ' (default)' : ''}</option>`,
    ),
    `<option value="custom"${selectedValue === 'custom' ? ' selected' : ''}>Custom command...${customIsDefault ? ' (default)' : ''}</option>`,
  ].join('');

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Terminal</div>
      <div class="kb-team-card">
        <select id="kb-project-ai-provider-select">${options}</select>
      </div>
      <input type="text" id="kb-project-ai-provider-custom-input" class="kb-input${selectedValue === 'custom' ? '' : ' kb-hidden'}" placeholder="Command to run, e.g. claude" value="${escapeHtml(customValue)}">
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
    ${renderHomeTerminalSection(state)}
  `;
}
