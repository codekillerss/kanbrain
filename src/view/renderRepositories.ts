import type { RenderState } from './render';
import { escapeHtml } from './escapeHtml';

export function renderRepositories(state: RenderState): string {
  const config = state.config!;
  const entries = Object.entries(config.repositories ?? {});

  const body = entries.length
    ? entries
        .map(
          ([id, entry]) => `
      <div class="kb-repo-row" data-repository-id="${escapeHtml(id)}">
        <div class="kb-repo-name">${escapeHtml(entry.name)}</div>
        <div class="kb-config-field-path">
          <input type="text" class="kb-input" data-field="path" placeholder="Local folder path" value="${escapeHtml(entry.path)}">
          <button type="button" data-action="pick-repository-folder" title="Browse for a folder">…</button>
        </div>
      </div>
    `,
        )
        .join('')
    : '<div class="kb-empty">No repositories mapped yet. Run Kanbrain: Setup or Kanbrain: Sync Board Configuration to discover them.</div>';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Repository Paths</div>
      ${body}
    </div>
  `;
}
