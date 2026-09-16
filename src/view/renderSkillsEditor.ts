import type { SkillEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { isValidHexColor, normalizeHex } from './badgeColor';

function renderColorField(field: 'textColor' | 'buttonColor', value: string, placeholder: string): string {
  const pickerValue = value && isValidHexColor(value) ? normalizeHex(value) : '#000000';
  return `
    <div class="kb-config-field-color">
      <input type="text" class="kb-input" data-field="${field}" placeholder="${placeholder}" value="${escapeHtml(value)}">
      <input type="color" class="kb-color-picker" data-color-for="${field}" value="${pickerValue}">
    </div>
  `;
}

function renderSkillPreviewStyle(entry: SkillEntry): string {
  const textColor = entry.textColor && isValidHexColor(entry.textColor) ? normalizeHex(entry.textColor) : null;
  const buttonColor = entry.buttonColor && isValidHexColor(entry.buttonColor) ? normalizeHex(entry.buttonColor) : null;
  return buttonColor || textColor
    ? ` style="${buttonColor ? `background-color: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
    : '';
}

function renderSkillRow(id: string, entry: SkillEntry): string {
  const path = entry.path ?? '';
  const label = entry.label ?? '';
  const textColor = entry.textColor ?? '';
  const buttonColor = entry.buttonColor ?? '';
  const isGlobal = entry.isGlobal ?? false;
  const previewLabel = entry.label || (entry.path ? (entry.path.split('/').pop() ?? entry.path) : 'New skill');

  return `
    <div class="kb-config-level">
      <button type="button" class="kb-config-level-header kb-global-skill-header" data-action="toggle-group"${renderSkillPreviewStyle(entry)}>
        <span class="kb-chevron">▾</span>${escapeHtml(previewLabel)}
      </button>
      <div class="kb-config-level-body kb-hidden">
        <div class="kb-config-row" data-skill-id="${escapeHtml(id)}">
          <input type="text" class="kb-input" data-field="label" placeholder="Label" value="${escapeHtml(label)}">
          <div class="kb-config-field-path">
            <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
            <button type="button" data-action="pick-skill-file" title="Browse for a file">…</button>
          </div>
          ${renderColorField('textColor', textColor, 'Text color hex')}
          ${renderColorField('buttonColor', buttonColor, 'Button color hex')}
          <label class="kb-checkbox-row">
            <input type="checkbox" data-field="isGlobal" ${isGlobal ? 'checked' : ''}>
            Global
            <span class="kb-info-icon" title="Shows in the &quot;▾&quot; menu on every card, regardless of status">ⓘ</span>
          </label>
        </div>
      </div>
      <button type="button" class="kb-icon-btn kb-icon-btn-danger kb-remove-skill-btn" data-action="remove-skill" data-skill-id="${escapeHtml(id)}" title="Remove skill">✕</button>
    </div>
  `;
}

export function renderSkillsEditor(skills: Record<string, SkillEntry>): string {
  const entries = Object.entries(skills);
  if (entries.length === 0) {
    return '<div class="kb-empty">No skills configured yet.</div>';
  }
  return entries.map(([id, entry]) => renderSkillRow(id, entry)).join('');
}
