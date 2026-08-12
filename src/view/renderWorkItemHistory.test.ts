import { describe, expect, it } from 'vitest';
import { renderWorkItemHistory } from './renderWorkItemHistory';
import type { KanbrainConfig, WorkItem } from '../types';

const config: KanbrainConfig = {
  organization: 'org', project: 'project', defaultTeam: 'team', skills: {},
  statusColors: { Active: '00ff00' }, typeColors: {}, typeIcons: {},
};
const item = (id: number, title: string): WorkItem => ({
  id, title, description: '', status: 'Active', type: 'Task', url: '', parentId: null,
  childIds: [], assignedTo: null, development: [],
});

describe('renderWorkItemHistory', () => {
  it('keeps recent-first order and makes cards selectable', () => {
    const html = renderWorkItemHistory([item(2, 'Newest'), item(1, 'Older')], config);
    expect(html.indexOf('Newest')).toBeLessThan(html.indexOf('Older'));
    expect(html).toContain('data-action="pick-work-item" data-id="2"');
  });

  it('renders an empty state and escapes titles', () => {
    expect(renderWorkItemHistory([], config)).toContain('No work item history yet.');
    expect(renderWorkItemHistory([item(1, '<unsafe>')], config)).toContain('&lt;unsafe&gt;');
  });

  it('puts status on its own line before the assignee/details footer', () => {
    const html = renderWorkItemHistory([{ ...item(1, 'Task'), assignedTo: { displayName: 'Jane Doe', imageUrl: null } }], config);
    expect(html).toContain('kb-history-item-status');
    expect(html).toContain('kb-result-item-assignee');
    expect(html.indexOf('kb-history-item-status')).toBeLessThan(html.indexOf('Jane Doe'));
    expect(html.indexOf('Jane Doe')).toBeLessThan(html.indexOf('View details'));
  });

  it('disables the pick action and shows a badge for the current work item', () => {
    const html = renderWorkItemHistory([item(2, 'Newest'), item(1, 'Older')], config, {}, 1);
    expect(html).toContain('data-action="pick-work-item" data-id="1" disabled>');
    expect(html).toContain('kb-current-badge');
    expect(html).toContain('Current');
    expect(html).not.toContain('data-action="pick-work-item" data-id="2" disabled>');
  });

  it('does not disable the "View details" button for the current work item', () => {
    const html = renderWorkItemHistory([item(1, 'Older')], config, {}, 1);
    expect(html).toContain('data-action="open-work-item-detail" data-id="1">View details');
  });

  it('disables no items when currentWorkItemId is omitted', () => {
    const html = renderWorkItemHistory([item(2, 'Newest'), item(1, 'Older')], config);
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('kb-current-badge');
  });
});
