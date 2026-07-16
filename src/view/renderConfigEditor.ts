import type { KanbrainConfig, SkillEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
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

function renderSkillEntryRow(level: string, status: string, entry: SkillEntry | null, statusColors: Record<string, string>): string {
  const path = entry?.path ?? '';
  const label = entry?.label ?? '';
  const textColor = entry?.textColor ?? '';
  const buttonColor = entry?.buttonColor ?? '';

  return `
    <div class="kb-config-row" data-level="${escapeHtml(level)}" data-status="${escapeHtml(status)}">
      <div class="kb-config-row-status">${renderStatusDot(status, statusColors)}${escapeHtml(status)}</div>
      <div class="kb-config-field-path">
        <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
        <button type="button" data-action="pick-skill-file" title="Browse for a file">…</button>
      </div>
      <input type="text" class="kb-input" data-field="label" placeholder="Label (optional)" value="${escapeHtml(label)}">
      ${renderColorField('textColor', textColor, 'Text color hex')}
      ${renderColorField('buttonColor', buttonColor, 'Button color hex')}
    </div>
  `;
}

export function renderConfigEditor(config: KanbrainConfig): string {
  const levels = Object.keys(config.backlogLevels);
  if (levels.length === 0) {
    return '<div class="kb-empty">No backlog levels configured yet.</div>';
  }

  return levels
    .map(level => {
      const statuses = config.backlogLevels[level];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(level, status, statuses[status], config.statusColors ?? {}))
        .join('');
      return `
        <div class="kb-config-level">
          <div class="kb-section-label">${escapeHtml(level)}</div>
          ${rows}
        </div>
      `;
    })
    .join('');
}
