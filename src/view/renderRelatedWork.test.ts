import { describe, it, expect } from 'vitest';
import { renderRelatedWorkSection } from './renderRelatedWork';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {},
  statusColors: {},
  typeColors: {},
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('renderRelatedWorkSection', () => {
  it('returns an empty string when there is no parent and no children', () => {
    expect(renderRelatedWorkSection(null, [], config)).toBe('');
  });

  it('shows only the Parent subgroup when there is a parent but no children', () => {
    const parent = workItem({ id: 900, title: 'Epic <parent>' });
    const html = renderRelatedWorkSection(parent, [], config);

    expect(html).toContain('Related Work');
    expect(html).toContain('Parent');
    expect(html).toContain('#900');
    expect(html).toContain('Epic &lt;parent&gt;');
    expect(html).toContain('<svg');
    expect(html).not.toContain('>Child<');
  });

  it('shows only the Child subgroup when there are children but no parent', () => {
    const children = [workItem({ id: 101, title: 'Sub 1' }), workItem({ id: 102, title: 'Sub 2' })];
    const html = renderRelatedWorkSection(null, children, config);

    expect(html).toContain('>Child<');
    expect(html).toContain('#101');
    expect(html).toContain('Sub 1');
    expect(html).toContain('#102');
    expect(html).toContain('Sub 2');
    expect(html).not.toContain('>Parent<');
  });

  it('shows both subgroups when there is a parent and children', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const children = [workItem({ id: 101, title: 'Sub 1' })];
    const html = renderRelatedWorkSection(parent, children, config);

    expect(html).toContain('>Parent<');
    expect(html).toContain('>Child<');
    expect(html).toContain('#900');
    expect(html).toContain('#101');
  });
});
