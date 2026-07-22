import { describe, it, expect } from 'vitest';
import { resolvePlaceholders, type SkillTemplateContext } from './resolvePlaceholders';
import type { WorkItem } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug in login',
    description: 'Bug description',
    status: 'Active',
    type: 'Task',
    url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

describe('resolvePlaceholders', () => {
  it('replaces simple placeholders with work item fields', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: 'feature/90' };
    const result = resolvePlaceholders('# {{title}} (#{{id}}) - {{status}}', context);
    expect(result).toBe('# Fix bug in login (#482) - Active');
  });

  it('replaces {{branch}} and {{url}}', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: 'feature/90' };
    const result = resolvePlaceholders('{{branch}} {{url}}', context);
    expect(result).toBe('feature/90 https://dev.azure.com/org/proj/_workitems/edit/482');
  });

  it('replaces parent placeholders with empty strings when there is no parent', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: '' };
    const result = resolvePlaceholders('Parent: [{{parent.id}}] {{parent.title}}', context);
    expect(result).toBe('Parent: [] ');
  });

  it('replaces parent placeholders with parent data when present', () => {
    const parent = workItem({ id: 90, title: 'Parent PBI', description: 'parent desc' });
    const context: SkillTemplateContext = { workItem: workItem(), parent, subtasks: [], branch: '' };
    const result = resolvePlaceholders('{{parent.id}} {{parent.title}} {{parent.description}}', context);
    expect(result).toBe('90 Parent PBI parent desc');
  });

  it('renders a checklist for subtasks, checking Done/Closed statuses', () => {
    const subtasks = [
      workItem({ id: 1, title: 'A', status: 'Done' }),
      workItem({ id: 2, title: 'B', status: 'Active' }),
      workItem({ id: 3, title: 'C', status: 'Closed' }),
    ];
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks, branch: '' };
    const result = resolvePlaceholders('{{subtasks}}', context);
    expect(result).toBe('- [x] #1 — A\n- [ ] #2 — B\n- [x] #3 — C');
  });

  it('shows a placeholder message when there are no subtasks', () => {
    const context: SkillTemplateContext = { workItem: workItem(), parent: null, subtasks: [], branch: '' };
    const result = resolvePlaceholders('{{subtasks}}', context);
    expect(result).toBe('_No subtasks._');
  });
});
