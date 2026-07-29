import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';
import { renderProfilesEditor } from './renderProfilesEditor';

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
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Profiles</div>
      ${renderProfilesEditor(config.profiles ?? {})}
    </div>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
