import type { KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderRepositoriesBody(config: KanbrainConfig): string {
  const entries = Object.entries(config.repositories ?? {});

  return entries.length
    ? entries
        .map(
          ([id, entry]) => `
      <div class="kb-repo-row" data-repository-id="${escapeHtml(id)}">
        <div class="kb-repo-name">${escapeHtml(entry.name)}</div>
        <div class="kb-config-field-path">
          <input type="text" class="kb-input" data-field="path" placeholder="Local folder path" value="${escapeHtml(entry.path)}">
          <button type="button" data-action="pick-repository-folder" title="Browse for a folder">…</button>
          ${!entry.path ? '<button type="button" class="kb-secondary-btn" data-action="clone-repository" title="Clone this repository">Clone</button>' : ''}
        </div>
      </div>
    `,
        )
        .join('')
    : '<div class="kb-empty">No repositories mapped yet. Run Kanbrain: Setup or Kanbrain: Sync Board Configuration to discover them.</div>';
}
