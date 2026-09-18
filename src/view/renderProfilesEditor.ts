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
          <textarea class="kb-input kb-autosize-textarea" data-field="description" placeholder="Description">${escapeHtml(description)}</textarea>
        </div>
      </div>
      <button type="button" class="kb-icon-btn kb-icon-btn-danger kb-config-level-remove-btn" data-action="remove-profile" data-profile-id="${escapeHtml(id)}" title="Remove profile">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
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
      </div>
    </div>
  `;
}
