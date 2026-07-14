import type { WorkItem } from '../types';

export interface SkillTemplateContext {
  workItem: WorkItem;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  branch: string;
}

const DONE_STATUSES = new Set(['done', 'closed']);

function buildSubtasksChecklist(subtasks: WorkItem[]): string {
  if (subtasks.length === 0) {
    return '_Nenhuma subtask._';
  }
  return subtasks
    .map(s => `- [${DONE_STATUSES.has(s.status.toLowerCase()) ? 'x' : ' '}] #${s.id} — ${s.title}`)
    .join('\n');
}

export function resolvePlaceholders(template: string, context: SkillTemplateContext): string {
  const { workItem, parent, subtasks, branch } = context;
  const replacements: Record<string, string> = {
    '{{id}}': String(workItem.id),
    '{{title}}': workItem.title,
    '{{description}}': workItem.description,
    '{{status}}': workItem.status,
    '{{type}}': workItem.type,
    '{{url}}': workItem.url,
    '{{branch}}': branch,
    '{{parent.id}}': parent ? String(parent.id) : '',
    '{{parent.title}}': parent ? parent.title : '',
    '{{parent.description}}': parent ? parent.description : '',
    '{{subtasks}}': buildSubtasksChecklist(subtasks),
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}
