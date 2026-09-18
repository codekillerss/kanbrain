import type { RenderState } from './render';
import type { KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';

const AI_PROVIDER_PRESETS = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex CLI', command: 'codex' },
];

function renderAiProviderSection(config: KanbrainConfig): string {
  const current = config.aiProviderCommand ?? '';
  const matchedPreset = AI_PROVIDER_PRESETS.find(p => p.command === current);
  const selectedValue = current === '' ? 'none' : matchedPreset ? matchedPreset.id : 'custom';
  const customValue = selectedValue === 'custom' ? current : '';

  const options = [
    `<option value="none" data-command=""${selectedValue === 'none' ? ' selected' : ''}>None — just open a plain terminal</option>`,
    ...AI_PROVIDER_PRESETS.map(
      p => `<option value="${p.id}" data-command="${escapeHtml(p.command)}"${selectedValue === p.id ? ' selected' : ''}>${escapeHtml(p.label)}</option>`,
    ),
    `<option value="custom"${selectedValue === 'custom' ? ' selected' : ''}>Custom command...</option>`,
  ].join('');

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Terminal</div>
      <p class="kb-field-hint">When a skill opens a terminal, Kanbrain can start this command first, before sending the skill's instructions. Only applies to newly opened terminals.</p>
      <select id="kb-ai-provider-select">${options}</select>
      <input type="text" id="kb-ai-provider-custom-input" class="kb-input${selectedValue === 'custom' ? '' : ' kb-hidden'}" placeholder="Command to run, e.g. claude" value="${escapeHtml(customValue)}">
    </div>
  `;
}

export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-section-card">
      <div class="kb-section-label">Project</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-configure-ai-btn" class="kb-secondary-btn">✨ Configure with AI</button>
      </div>
    </div>
    <div class="kb-section-card">
      <div class="kb-section-label">Display</div>
      <label class="kb-checkbox-row">
        <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
        Show assignee in search results
      </label>
    </div>
    ${renderAiProviderSection(config)}
  `;
}
