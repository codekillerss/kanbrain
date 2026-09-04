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

function renderGlobalSkillTrigger(id: number, hasEntries: boolean): string {
  if (!hasEntries) {
    return '';
  }
  return `<button type="button" class="kb-global-skill-trigger" data-action="toggle-global-skill-menu" data-id="${id}" title="Run a global skill">▾</button>`;
}

function renderSkillStyleAttr(skill: SkillEntry): string {
  const textColor = skill.textColor && isValidHexColor(skill.textColor) ? normalizeHex(skill.textColor) : null;
  const buttonColor = skill.buttonColor && isValidHexColor(skill.buttonColor) ? normalizeHex(skill.buttonColor) : null;
  return buttonColor || textColor
    ? ` style="${buttonColor ? `background-color: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
    : '';
}

function renderGlobalSkillMenu(id: number, globalSkills: Record<string, SkillEntry>): string {
  const entries = Object.entries(globalSkills);
  if (entries.length === 0) {
    return '';
  }
  const options = entries
    .map(([skillId, entry]) => {
      const label = entry.label ?? entry.path.split('/').pop() ?? entry.path;
      const style = renderSkillStyleAttr(entry);
      return `<button type="button" class="kb-global-skill-option" data-action="run-global-skill" data-id="${id}" data-skill-id="${escapeHtml(skillId)}"${style}>${escapeHtml(label)}</button>`;
    })
    .join('');
  return `<div class="kb-global-skill-menu kb-hidden">${options}</div>`;
}

function renderSkillButton(id: number, skill: SkillEntry): string {
  const label = skill.label ?? skill.path.split('/').pop() ?? skill.path;
  const style = renderSkillStyleAttr(skill);
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${id}"${style}>▶ ${escapeHtml(label)}</button>`;
}

function renderSkillPlaceholderButton(): string {
  return `<button class="kb-action-btn kb-action-btn-placeholder" disabled title="No skill configured for this status">▶</button>`;
}

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skill = resolveSkill(config, workItem);
  const globalSkills = config.globalSkills ?? {};
  const hasGlobalSkills = Object.keys(globalSkills).length > 0;
  if (!skill && !hasGlobalSkills) {
    return '';
  }
  const buttonHtml = skill ? renderSkillButton(workItem.id, skill) : renderSkillPlaceholderButton();
  const triggerHtml = renderGlobalSkillTrigger(workItem.id, hasGlobalSkills);
  const menuHtml = renderGlobalSkillMenu(workItem.id, globalSkills);
  return `
    <div class="kb-action-group">
      <div class="kb-action-pill">${buttonHtml}${triggerHtml}</div>
      ${menuHtml}
    </div>
  `;
}

function renderStatusRow(workItem: WorkItem, config: KanbrainConfig, editable: boolean): string {
  const dot = renderStatusDot(workItem.status, config.statusColors ?? {});
  const statuses = Object.keys(config.skills?.[workItem.type] ?? {});
  if (!editable || statuses.length === 0) {
    return `<div class="kb-status-row">${dot}${escapeHtml(workItem.status)}</div>`;
  }
  const options = statuses
    .map(status => {
      const selected = status === workItem.status ? ' selected' : '';
      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(status)}</option>`;
    })
    .join('');
  return `<div class="kb-status-row">${dot}<select class="kb-status-select" data-action="set-work-item-status" data-id="${workItem.id}">${options}</select></div>`;
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
  options: { editableStatus?: boolean } = {},
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
      ${renderStatusRow(workItem, config, options.editableStatus === true)}
      ${assigneeHtml}
      ${parentHtml}
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
