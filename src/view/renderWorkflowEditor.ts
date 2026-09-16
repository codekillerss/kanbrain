import type { KanbrainConfig, SkillEntry, WorkflowStepConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';

function skillOptionLabel(id: string, entry: SkillEntry): string {
  return entry.label || (entry.path ? (entry.path.split('/').pop() ?? entry.path) : id);
}

function renderSkillSelect(step: WorkflowStepConfig | null, skills: Record<string, SkillEntry>): string {
  const selectedId = step?.skillId ?? '';
  const options = Object.entries(skills)
    .map(([id, entry]) => `<option value="${escapeHtml(id)}"${id === selectedId ? ' selected' : ''}>${escapeHtml(skillOptionLabel(id, entry))}</option>`)
    .join('');
  return `
    <select class="kb-input" data-field="skillId">
      <option value="" class="kb-select-none-option"${selectedId ? '' : ' selected'}>— No skill —</option>
      ${options}
    </select>
  `;
}

function renderWorkflowStepRow(type: string, status: string, step: WorkflowStepConfig | null, skills: Record<string, SkillEntry>, statusColors: Record<string, string>): string {
  const definitionOfDone = step?.definitionOfDone?.join('\n') ?? '';
  const artifacts = step?.artifacts?.join('\n') ?? '';

  return `
    <div class="kb-config-row kb-workflow-row" data-level="${escapeHtml(type)}" data-status="${escapeHtml(status)}">
      <div class="kb-config-row-status">${renderStatusDot(status, statusColors)}${escapeHtml(status)}</div>
      ${renderSkillSelect(step, skills)}
      <textarea class="kb-input kb-workflow-textarea" data-field="definitionOfDone" placeholder="Definition of Done (one item per line)" rows="3">${escapeHtml(definitionOfDone)}</textarea>
      <textarea class="kb-input kb-workflow-textarea" data-field="artifacts" placeholder="Expected artifacts (one item per line)" rows="3">${escapeHtml(artifacts)}</textarea>
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
