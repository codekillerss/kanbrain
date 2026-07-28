import type { ProfileEntry } from '../types';
import { escapeHtml } from './escapeHtml';

function renderProfileRow(id: string, entry: ProfileEntry): string {
  const label = entry.label ?? '';
  const description = entry.description ?? '';
  const previewLabel = label || 'New profile';

  return `
    <div class="kb-config-level">
      <button type="button" class="kb-config-level-header" data-action="toggle-group">
        <span class="kb-chevron">▾</span>${escapeHtml(previewLabel)}
      </button>
      <div class="kb-config-level-body kb-hidden">
        <div class="kb-config-row" data-profile-id="${escapeHtml(id)}">
          <input type="text" class="kb-input" data-field="label" placeholder="Label" value="${escapeHtml(label)}">
          <textarea class="kb-input kb-textarea" data-field="description" placeholder="Description">${escapeHtml(description)}</textarea>
          <button type="button" class="kb-icon-btn" data-action="remove-profile" data-profile-id="${escapeHtml(id)}" title="Remove">✕</button>
        </div>
      </div>
    </div>
  `;
}

export function renderProfilesEditor(profiles: Record<string, ProfileEntry>): string {
  const rows = Object.entries(profiles)
    .map(([id, entry]) => renderProfileRow(id, entry))
    .join('');
  return `
    <div class="kb-config-level">
      <div class="kb-config-static-header">Profiles</div>
      <div class="kb-config-level-body">
        ${rows}
        <button type="button" class="kb-secondary-btn" data-action="add-profile">+ Add profile</button>
      </div>
    </div>
  `;
}
