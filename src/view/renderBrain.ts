import type { RenderState } from './render';
import { renderRepositoriesBody } from './renderRepositories';
import { renderConfigEditor } from './renderConfigEditor';
import { renderProfilesEditor } from './renderProfilesEditor';

function renderSegment(title: string, segment: string, body: string, collapsed: boolean): string {
  return `
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">
        <button type="button" class="kb-parent-header-toggle" data-action="toggle-group">
          <span><span class="kb-chevron">▾</span>${title}</span>
        </button>
        <button type="button" class="kb-secondary-btn" data-action="run-segment-ai" data-segment="${segment}">✨ Configure with AI</button>
      </div>
      <div class="kb-collapsible-body${collapsed ? ' kb-hidden' : ''}">
        ${body}
      </div>
    </div>
  `;
}

export function renderBrain(state: RenderState): string {
  const config = state.config!;
  return [
    renderSegment('Repositories', 'repositories', renderRepositoriesBody(config), false),
    renderSegment('Skills', 'skills', renderConfigEditor(config), true),
    renderSegment('Profiles', 'profiles', renderProfilesEditor(config.profiles ?? {}), true),
  ].join('');
}
