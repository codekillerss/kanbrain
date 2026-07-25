import type { KanbrainConfig, SkillEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { isValidHexColor, normalizeHex } from './badgeColor';
import { renderTypeAccent } from './renderTypeAccent';

function renderColorField(field: 'textColor' | 'buttonColor', value: string, placeholder: string): string {
  const pickerValue = value && isValidHexColor(value) ? normalizeHex(value) : '#000000';
  return `
    <div class="kb-config-field-color">
      <input type="text" class="kb-input" data-field="${field}" placeholder="${placeholder}" value="${escapeHtml(value)}">
      <input type="color" class="kb-color-picker" data-color-for="${field}" value="${pickerValue}">
    </div>
  `;
}

function renderSkillEntryRow(type: string, status: string, entry: SkillEntry | null, statusColors: Record<string, string>): string {
  const path = entry?.path ?? '';
  const label = entry?.label ?? '';
  const textColor = entry?.textColor ?? '';
  const buttonColor = entry?.buttonColor ?? '';

  return `
    <div class="kb-config-row" data-level="${escapeHtml(type)}" data-status="${escapeHtml(status)}">
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

function renderGlobalSkillPreviewStyle(entry: SkillEntry): string {
  const textColor = entry.textColor && isValidHexColor(entry.textColor) ? normalizeHex(entry.textColor) : null;
  const buttonColor = entry.buttonColor && isValidHexColor(entry.buttonColor) ? normalizeHex(entry.buttonColor) : null;
  return buttonColor || textColor
    ? ` style="${buttonColor ? `background-color: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
    : '';
}

function renderGlobalSkillRow(id: string, entry: SkillEntry): string {
  const path = entry.path ?? '';
  const label = entry.label ?? '';
  const textColor = entry.textColor ?? '';
  const buttonColor = entry.buttonColor ?? '';
  const previewLabel = entry.label || (entry.path ? (entry.path.split('/').pop() ?? entry.path) : 'New global skill');

  return `
    <div class="kb-config-level">
      <button type="button" class="kb-config-level-header kb-global-skill-header" data-action="toggle-group"${renderGlobalSkillPreviewStyle(entry)}>
        <span class="kb-chevron">▾</span>${escapeHtml(previewLabel)}
      </button>
      <div class="kb-config-level-body kb-hidden">
        <div class="kb-config-row" data-global-skill-id="${escapeHtml(id)}">
          <div class="kb-config-field-path">
            <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
            <button type="button" data-action="pick-skill-file" title="Browse for a file">…</button>
          </div>
          <input type="text" class="kb-input" data-field="label" placeholder="Label" value="${escapeHtml(label)}">
          ${renderColorField('textColor', textColor, 'Text color hex')}
          ${renderColorField('buttonColor', buttonColor, 'Button color hex')}
          <button type="button" class="kb-icon-btn" data-action="remove-global-skill" data-global-skill-id="${escapeHtml(id)}" title="Remove">✕</button>
        </div>
      </div>
    </div>
  `;
}

function renderGlobalSkillsSection(globalSkills: Record<string, SkillEntry>): string {
  const rows = Object.entries(globalSkills)
    .map(([id, entry]) => renderGlobalSkillRow(id, entry))
    .join('');
  return `
    <div class="kb-config-level">
      <div class="kb-config-static-header">Global Skills</div>
      <div class="kb-config-level-body">
        ${rows}
        <button type="button" class="kb-secondary-btn" data-action="add-global-skill">+ Add global skill</button>
      </div>
    </div>
  `;
}

export function renderConfigEditor(config: KanbrainConfig): string {
  const types = Object.keys(config.skills);
  const globalSkillsHtml = renderGlobalSkillsSection(config.globalSkills ?? {});

  if (types.length === 0) {
    return `<div class="kb-empty">No work item types configured yet.</div>${globalSkillsHtml}`;
  }

  const typesHtml = types
    .map(type => {
      const statuses = config.skills[type];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(type, status, statuses[status], config.statusColors ?? {}))
        .join('');
      const { borderStyle, iconHtml } = renderTypeAccent(type, config);
      return `
        <div class="kb-config-level">
          <button type="button" class="kb-config-level-header" data-action="toggle-group"${borderStyle}>
            <span class="kb-chevron">▾</span>${iconHtml}${escapeHtml(type)}
          </button>
          <div class="kb-config-level-body kb-hidden">
            ${rows}
          </div>
        </div>
      `;
    })
    .join('');

  return typesHtml + globalSkillsHtml;
}
