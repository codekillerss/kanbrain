import type { WorkItem, KanbrainConfig, SkillEntry } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';
import { renderParentRow } from './renderParent';
import { renderDevelopmentBadge } from './renderDevelopment';
import { resolveShowAssignedTo } from '../config/resolveCardFieldVisibility';
import { isValidHexColor, normalizeHex } from './badgeColor';

function renderPickButton(id: number): string {
  return `<button type="button" class="kb-icon-btn kb-pick-btn" data-action="pick-work-item" data-id="${id}" title="Set as current work item">⇄</button>`;
}

function renderGlobalSkillSelect(id: number, globalSkills: Record<string, SkillEntry>): string {
  const entries = Object.entries(globalSkills);
  if (entries.length === 0) {
    return '';
  }
  const options = entries
    .map(([skillId, entry]) => {
      const label = entry.label ?? entry.path.split('/').pop() ?? entry.path;
      return `<option value="${escapeHtml(skillId)}">${escapeHtml(label)}</option>`;
    })
    .join('');
  return `
    <select class="kb-global-skill-select" data-action="run-global-skill" data-id="${id}">
      <option value="" selected disabled>▾</option>
      ${options}
    </select>
  `;
}

function renderSkillButton(id: number, skill: SkillEntry): string {
  const label = skill.label ?? skill.path.split('/').pop() ?? skill.path;
  const textColor = skill.textColor && isValidHexColor(skill.textColor) ? normalizeHex(skill.textColor) : null;
  const buttonColor = skill.buttonColor && isValidHexColor(skill.buttonColor) ? normalizeHex(skill.buttonColor) : null;
  const style =
    buttonColor || textColor
      ? ` style="${buttonColor ? `background: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
      : '';
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${id}"${style}>▶ ${escapeHtml(label)}</button>`;
}

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skill = resolveSkill(config, workItem);
  const buttonHtml = skill ? renderSkillButton(workItem.id, skill) : '';
  const globalSkillHtml = renderGlobalSkillSelect(workItem.id, config.globalSkills ?? {});
  if (!buttonHtml && !globalSkillHtml) {
    return '';
  }
  return `<div class="kb-action-group">${buttonHtml}${globalSkillHtml}</div>`;
}

export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
  selectedTeam: string | undefined = undefined,
  showPickButton = false,
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedTeam);
  const assigneeHtml = showAssignedTo ? renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row') : '';
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentBadge(workItem.development);
  const titleAttrs = clickableTitle
    ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
    : ' class="kb-title"';

  return `
    <div class="${cssClass}"${borderStyle}>
      ${showPickButton ? renderPickButton(workItem.id) : ''}
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
        <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      </div>
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${assigneeHtml}
      ${parentHtml}
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
