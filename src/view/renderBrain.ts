import type { RenderState } from './render';
import { renderRepositoriesBody } from './renderRepositories';
import { renderConfigEditor } from './renderConfigEditor';
import { renderProfilesEditor } from './renderProfilesEditor';

function renderSegment(title: string, icon: string, segment: string, body: string, pinnedActionHtml: string, expanded: boolean): string {
  return `
    <div class="kb-config-parent-section${expanded ? ' kb-config-parent-section-expanded' : ''}">
      <div class="kb-config-parent-header">
        <button type="button" class="kb-parent-header-toggle" data-action="toggle-group" data-segment="${segment}">
          <span><span class="kb-chevron">▾</span>${icon} ${title}</span>
        </button>
        <button type="button" class="kb-secondary-btn" data-action="run-segment-ai" data-segment="${segment}">✨ Configure with AI</button>
      </div>
      <div class="kb-collapsible-body${expanded ? '' : ' kb-hidden'}">
        <div class="kb-segment-scroll">
          ${body}
        </div>
        ${pinnedActionHtml}
      </div>
    </div>
  `;
}

export function renderBrain(state: RenderState): string {
  const config = state.config!;
  const openSegment = state.openBrainSegment === undefined ? 'skills' : state.openBrainSegment;

  return `
    <div class="kb-brain-segments">
      ${renderSegment(
        'Skills',
        '🛠️',
        'skills',
        renderConfigEditor(config),
        '<button type="button" class="kb-secondary-btn" data-action="add-global-skill">+ Add global skill</button>',
        openSegment === 'skills',
      )}
      ${renderSegment(
        'Profiles',
        '👤',
        'profiles',
        renderProfilesEditor(config.profiles ?? {}),
        '<button type="button" class="kb-secondary-btn" data-action="add-profile">+ Add profile</button>',
        openSegment === 'profiles',
      )}
      ${renderSegment('Repositories', '📁', 'repositories', renderRepositoriesBody(config), '', openSegment === 'repositories')}
    </div>
  `;
}
