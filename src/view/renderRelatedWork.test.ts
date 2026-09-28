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

describe('renderRelatedWorkSection children order and muting', () => {
  const cfg: KanbrainConfig = {
    ...config,
    statusCategoriesByType: { Task: { Active: 'InProgress', Closed: 'Completed' }, 'User Story': { Active: 'InProgress' } },
    backlogLevelsByTeam: { 'MyProject Team': { 'User Story': 1, Task: 0 } },
  };

  it('lists children in sortChildren order, using the default team backlog levels', () => {
    const children = [
      workItem({ id: 101, title: 'Done task', status: 'Closed' }),
      workItem({ id: 102, title: 'Active task' }),
      workItem({ id: 103, title: 'Active story', type: 'User Story' }),
    ];
    const html = renderRelatedWorkSection(null, children, cfg);

    const positions = ['#103', '#102', '#101'].map(id => html.indexOf(id));
    expect(positions.every(p => p > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('marks only Completed children with the muted class', () => {
    const html = renderRelatedWorkSection(null, [workItem({ id: 101, status: 'Closed' }), workItem({ id: 102 })], cfg);

    const tagFor = (id: number) => {
      const start = html.lastIndexOf('<a class="kb-related-item', html.indexOf(`#${id}`));
      return html.slice(start, html.indexOf('>', start) + 1);
    };
    expect(tagFor(101)).toContain('kb-related-item-completed');
    expect(tagFor(102)).not.toContain('kb-related-item-completed');
  });

  it('never mutes the parent, even when it is Completed', () => {
    const html = renderRelatedWorkSection(workItem({ id: 900, status: 'Closed' }), [], cfg);
    expect(html).not.toContain('kb-related-item-completed');
  });
});

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

  it('links each item to a command URI that opens its own detail panel', () => {
    const parent = workItem({ id: 900, title: 'Epic parent' });
    const html = renderRelatedWorkSection(parent, [], config);

    const hrefMatch = html.match(/href="(command:kanbrain\.openWorkItemDetail\?[^"]+)"/);
    expect(hrefMatch).not.toBeNull();

    const [, href] = hrefMatch!;
    const [command, encodedArgs] = href.split('?');
    expect(command).toBe('command:kanbrain.openWorkItemDetail');
    expect(JSON.parse(decodeURIComponent(encodedArgs))).toEqual([900]);
  });
});
