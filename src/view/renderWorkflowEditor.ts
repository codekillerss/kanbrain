import type { KanbrainConfig, SkillEntry, WorkflowStepConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from './badgeColor';
import { renderTypeAccent } from './renderTypeAccent';

const NO_SKILL_LABEL = '— No skill —';

function skillOptionLabel(id: string, entry: SkillEntry): string {
  return entry.label || (entry.path ? (entry.path.split('/').pop() ?? entry.path) : id);
}

function skillFileName(entry: SkillEntry): string {
  return entry.path ? (entry.path.split('/').pop() ?? entry.path) : '';
}

function renderSkillPickerOption(id: string, label: string, fileName: string, active: boolean, noneStyle: boolean): string {
  const labelClass = noneStyle ? 'kb-skill-picker-option-label kb-select-none-option' : 'kb-skill-picker-option-label';
  const pathHtml = fileName ? `<span class="kb-skill-picker-option-path">${escapeHtml(fileName)}</span>` : '';
  return `
    <button type="button" class="kb-skill-picker-option${active ? ' kb-skill-picker-option-active' : ''}" data-action="select-skill" data-skill-id="${escapeHtml(id)}">
      <span class="${labelClass}">${escapeHtml(label)}</span>
      ${pathHtml}
    </button>
  `;
}


function renderSkillPicker(step: WorkflowStepConfig | null, skills: Record<string, SkillEntry>): string {
  const selectedId = step?.skillId ?? '';
  const selectedEntry = selectedId ? skills[selectedId] : undefined;
  const triggerLabel = selectedEntry ? skillOptionLabel(selectedId, selectedEntry) : NO_SKILL_LABEL;
  const triggerLabelClass = selectedEntry ? 'kb-skill-picker-trigger-label' : 'kb-skill-picker-trigger-label kb-select-none-option';

  const options = [
    renderSkillPickerOption('', NO_SKILL_LABEL, '', !selectedId, true),
    ...Object.entries(skills).map(([id, entry]) => renderSkillPickerOption(id, skillOptionLabel(id, entry), skillFileName(entry), id === selectedId, false)),
  ].join('');

  return `
    <div class="kb-skill-picker">
      <button type="button" class="kb-input kb-skill-picker-trigger" data-action="toggle-skill-picker">
        <span class="${triggerLabelClass}">${escapeHtml(triggerLabel)}</span>
        <span class="kb-skill-picker-icon">▾</span>
      </button>
      <input type="hidden" data-field="skillId" value="${escapeHtml(selectedId)}">
      <div class="kb-skill-picker-menu kb-hidden">${options}</div>
    </div>
  `;
}

function renderStatusHeaderStyle(status: string, statusColors: Record<string, string>): string {
  const color = statusColors[status];
  if (!color || !isValidHexColor(color)) {
    return '';
  }
  const background = normalizeHex(color);
  return ` style="background-color: ${background}; color: ${pickReadableTextColor(background)};"`;
}

function renderWorkflowStepRow(type: string, status: string, step: WorkflowStepConfig | null, skills: Record<string, SkillEntry>, statusColors: Record<string, string>): string {
  const definitionOfDone = step?.definitionOfDone?.join('\n') ?? '';
  const artifacts = step?.artifacts?.join('\n') ?? '';

  return `
    <div class="kb-config-row kb-workflow-row" data-level="${escapeHtml(type)}" data-status="${escapeHtml(status)}">
      <div class="kb-config-row-status"${renderStatusHeaderStyle(status, statusColors)}>${escapeHtml(status)}</div>
      <div class="kb-workflow-row-body">
        ${renderSkillPicker(step, skills)}
        <textarea class="kb-input kb-workflow-textarea" data-field="definitionOfDone" placeholder="Definition of Done (one item per line)">${escapeHtml(definitionOfDone)}</textarea>
        <textarea class="kb-input kb-workflow-textarea" data-field="artifacts" placeholder="Expected artifacts (one item per line)">${escapeHtml(artifacts)}</textarea>
      </div>
    </div>
  `;
}

export function renderWorkflowEditor(config: KanbrainConfig): string {
  const types = Object.keys(config.workflowSteps);
  if (types.length === 0) {
    return '<div class="kb-empty">No work item types configured yet.</div>';
  }

  return types
    .map(type => {
      const statuses = config.workflowSteps[type];
      const rows = Object.keys(statuses)
        .map(status => renderWorkflowStepRow(type, status, statuses[status], config.skills, config.statusColors ?? {}))
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
}
