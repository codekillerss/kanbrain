import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';

export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Skill Configuration</div>
    ${renderConfigEditor(config)}
  `;
}
