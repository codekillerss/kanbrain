import type { WorkItem, KanbrainConfig, SkillEntry } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';
import { renderParentRow } from './renderParent';
import { renderDevelopmentBadge } from './renderDevelopment';
import { resolveShowAssignedTo } from '../config/resolveCardFieldVisibility';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from './badgeColor';

function renderPickButton(id: number): string {
  return `<button type="button" class="kb-icon-btn kb-pick-btn" data-action="pick-work-item" data-id="${id}" title="Set as current work item">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146"/></svg>
  </button>`;
}

function renderOpenInBrowserButton(id: number, url: string, nextToPickButton: boolean): string {
  const offsetClass = nextToPickButton ? ' kb-with-pick' : '';
  return `<a class="kb-icon-btn kb-open-browser-btn${offsetClass}" href="command:kanbrain.openWorkItemInBrowser?${encodeURIComponent(JSON.stringify([id, url]))}" title="Open in browser">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="8 7 17 7 17 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
  </a>`;
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
  const globalSkills = Object.fromEntries(Object.entries(config.skills ?? {}).filter(([, entry]) => entry.isGlobal));
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

function renderAdvanceStatusButton(workItem: WorkItem, statuses: string[], statusColors: Record<string, string>): string {
  const currentIndex = statuses.indexOf(workItem.status);
  const nextStatus = currentIndex >= 0 ? statuses[currentIndex + 1] : undefined;
  if (!nextStatus) {
    return `<button type="button" class="kb-status-advance-btn" disabled title="No next status">&gt;&gt;</button>`;
  }
  const rawColor = statusColors[nextStatus];
  let styleAttr = '';
  if (rawColor && isValidHexColor(rawColor)) {
    const background = normalizeHex(rawColor);
    const contrast = pickReadableTextColor(background);
    styleAttr = ` style="background-color: ${background}; color: ${contrast}; border-color: ${contrast};"`;
  }
  return `<button type="button" class="kb-status-advance-btn" data-action="advance-status" data-id="${workItem.id}" data-status="${escapeHtml(nextStatus)}" title="Advance to ${escapeHtml(nextStatus)}"${styleAttr}>&gt;&gt;</button>`;
}

function renderStatusPicker(workItem: WorkItem, config: KanbrainConfig): string {
  const statuses = Object.keys(config.workflowSteps[workItem.type] ?? {});
  const options = statuses
    .map(s => {
      const isActive = s === workItem.status;
      return `
      <button type="button" class="kb-status-picker-option${isActive ? ' kb-status-picker-option-active' : ''}" data-action="select-status" data-id="${workItem.id}" data-status="${escapeHtml(s)}">
        ${renderStatusDot(s, config.statusColors ?? {})}${escapeHtml(s)}${isActive ? '<span class="kb-status-picker-option-check">✓</span>' : ''}
      </button>`;
    })
    .join('');
  return `
    <div class="kb-status-editable-row">
      <div class="kb-status-picker">
        <button type="button" class="kb-status-row kb-status-picker-trigger" data-action="toggle-status-picker">
          <span class="kb-status-picker-trigger-label">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</span>
          <span class="kb-status-picker-icon">▾</span>
        </button>
        <div class="kb-status-picker-menu kb-hidden">${options}</div>
      </div>
      ${renderAdvanceStatusButton(workItem, statuses, config.statusColors ?? {})}
    </div>
  `;
}

function renderAssigneePicker(workItem: WorkItem, avatars: Record<string, string>): string {
  const current = workItem.assignedTo
    ? `${renderAvatarOrInitial(workItem.assignedTo.displayName, workItem.assignedTo.imageUrl, avatars)}${escapeHtml(workItem.assignedTo.displayName)}`
    : `<span class="kb-avatar-initial">?</span>Unassigned`;
  return `
    <div class="kb-assignee-picker" data-id="${workItem.id}">
      <button type="button" class="kb-assignee-row kb-assignee-picker-trigger" data-action="toggle-assignee-picker">${current}</button>
      <div class="kb-assignee-picker-menu kb-hidden">
        <input type="text" class="kb-input kb-assignee-search-input" data-id="${workItem.id}" placeholder="Search people...">
        <button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItem.id}" data-unique-name="">Unassigned</button>
        <div class="kb-assignee-picker-results"></div>
      </div>
    </div>
  `;
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
  editable = false,
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedTeam);
  // Assignee editing is temporarily disabled — the picker's styling isn't ready yet — so this
  // always renders the static row for now, regardless of `editable`. The rest of the write path
  // (renderAssigneePicker, the message handlers, searchIdentities) is left in place to re-enable
  // later.
  const assigneeHtml = !showAssignedTo ? '' : renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row');
  const statusHtml = editable
    ? renderStatusPicker(workItem, config)
    : `<div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>`;
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentBadge(workItem.development);
  const titleAttrs = clickableTitle
    ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
    : ' class="kb-title"';

  return `
    <div class="${cssClass}"${borderStyle}>
      ${renderOpenInBrowserButton(workItem.id, workItem.url, showPickButton)}
      ${showPickButton ? renderPickButton(workItem.id) : ''}
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
        <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      </div>
      ${statusHtml}
      ${assigneeHtml}
      ${parentHtml}
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
