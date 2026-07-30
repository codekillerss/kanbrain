import { describe, it, expect } from 'vitest';
import { renderFooter } from './renderFooter';
import type { RenderState } from './render';
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

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'home',
    ...overrides,
  };
}

describe('renderFooter', () => {
  it('returns nothing when there is no config', () => {
    const html = renderFooter(state({ config: null }));
    expect(html).toBe('');
  });

  it('shows Check Board Configuration and Sync Board Configuration buttons', () => {
    const html = renderFooter(state());
    expect(html).toContain('id="kb-run-check-board-config-btn"');
    expect(html).toContain('id="kb-run-sync-board-config-btn"');
  });

  it('does not show a Configure with AI button (that action lives on the Configuration page now)', () => {
    const html = renderFooter(state());
    expect(html).not.toContain('id="kb-run-configure-ai-btn"');
  });

  it('shows a Brain button and a Configuration button', () => {
    const html = renderFooter(state());
    expect(html).toContain('id="kb-show-brain-btn"');
    expect(html).toContain('id="kb-show-config-btn"');
  });

  it('orders icons as: home, work item, brain, check, sync, then configuration at the end', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const homeIndex = html.indexOf('id="kb-home-btn"');
    const workItemIndex = html.indexOf('id="kb-footer-work-item-btn"');
    const brainIndex = html.indexOf('id="kb-show-brain-btn"');
    const checkIndex = html.indexOf('id="kb-run-check-board-config-btn"');
    const syncIndex = html.indexOf('id="kb-run-sync-board-config-btn"');
    const configIndex = html.indexOf('id="kb-show-config-btn"');

    expect(homeIndex).toBeGreaterThanOrEqual(0);
    expect(workItemIndex).toBeGreaterThan(homeIndex);
    expect(brainIndex).toBeGreaterThan(workItemIndex);
    expect(checkIndex).toBeGreaterThan(brainIndex);
    expect(syncIndex).toBeGreaterThan(checkIndex);
    expect(configIndex).toBeGreaterThan(syncIndex);
  });

  it('puts a divider between the navigation icons (work item, brain) and the command icons (check, sync)', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const brainIndex = html.indexOf('id="kb-show-brain-btn"');
    const dividerIndex = html.indexOf('kb-footer-divider', brainIndex);
    const checkIndex = html.indexOf('id="kb-run-check-board-config-btn"');

    expect(dividerIndex).toBeGreaterThan(brainIndex);
    expect(checkIndex).toBeGreaterThan(dividerIndex);
  });

  it('puts a divider between the home icon and the current work item icon', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const homeIndex = html.indexOf('id="kb-home-btn"');
    const dividerIndex = html.indexOf('kb-footer-divider', homeIndex);
    const workItemIndex = html.indexOf('id="kb-footer-work-item-btn"');

    expect(dividerIndex).toBeGreaterThan(homeIndex);
    expect(workItemIndex).toBeGreaterThan(dividerIndex);
  });

  it('shows the active work item icon and id, linking to Flow', () => {
    const html = renderFooter(state({ workItem: workItem({ id: 482, type: 'Task' }), config: config({ typeIcons: { Task: '<svg><path d="M0 0"/></svg>' } }) }));

    expect(html).toContain('id="kb-footer-work-item-btn"');
    expect(html).toContain('#482');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
  });

  it('shows an empty work item icon that opens the work item picker (not Flow) when there is no active work item', () => {
    const html = renderFooter(state({ workItem: null }));

    expect(html).not.toContain('id="kb-footer-work-item-btn"');
    expect(html).toContain('id="kb-footer-select-work-item-btn"');
    expect(html).not.toContain('kb-footer-work-item-id');
  });

  it('marks the work item icon as active on the Flow screen', () => {
    const html = renderFooter(state({ screen: 'flow', workItem: workItem() }));
    const btnStart = html.indexOf('id="kb-footer-work-item-btn"');
    const tagStart = html.lastIndexOf('<button', btnStart);
    const tag = html.slice(tagStart, html.indexOf('>', btnStart));
    expect(tag).toContain('kb-footer-btn-active');
  });

  it('marks the brain icon as active on the Brain screen', () => {
    const html = renderFooter(state({ screen: 'brain' }));
    const btnStart = html.indexOf('id="kb-show-brain-btn"');
    const tagStart = html.lastIndexOf('<button', btnStart);
    const tag = html.slice(tagStart, html.indexOf('>', btnStart));
    expect(tag).toContain('kb-footer-btn-active');
  });

  it('marks the configuration icon as active on the Configuration screen', () => {
    const html = renderFooter(state({ screen: 'config' }));
    const btnStart = html.indexOf('id="kb-show-config-btn"');
    const tagStart = html.lastIndexOf('<button', btnStart);
    const tag = html.slice(tagStart, html.indexOf('>', btnStart));
    expect(tag).toContain('kb-footer-btn-active');
  });

  it('marks the home icon as active on the Home screen, and no other icon', () => {
    const html = renderFooter(state({ screen: 'home', workItem: workItem() }));

    const homeBtnStart = html.lastIndexOf('<button', html.indexOf('id="kb-home-btn"'));
    const homeBtnEnd = html.indexOf('>', homeBtnStart);
    expect(html.slice(homeBtnStart, homeBtnEnd)).toContain('kb-footer-btn-active');

    expect(html.split('kb-footer-btn-active').length - 1).toBe(1);
  });

  it('does not mark the home icon active outside the Home screen', () => {
    const html = renderFooter(state({ screen: 'flow', workItem: workItem() }));

    const homeBtnStart = html.lastIndexOf('<button', html.indexOf('id="kb-home-btn"'));
    const homeBtnEnd = html.indexOf('>', homeBtnStart);
    expect(html.slice(homeBtnStart, homeBtnEnd)).not.toContain('kb-footer-btn-active');
  });

  it('shows a Reviews button', () => {
    const html = renderFooter(state());
    expect(html).toContain('id="kb-show-reviews-btn"');
  });

  it('places the Reviews button after Brain and before the divider that precedes Check', () => {
    const html = renderFooter(state({ workItem: workItem() }));

    const brainIndex = html.indexOf('id="kb-show-brain-btn"');
    const reviewsIndex = html.indexOf('id="kb-show-reviews-btn"');
    const dividerIndex = html.indexOf('kb-footer-divider', brainIndex);
    const checkIndex = html.indexOf('id="kb-run-check-board-config-btn"');

    expect(reviewsIndex).toBeGreaterThan(brainIndex);
    expect(dividerIndex).toBeGreaterThan(reviewsIndex);
    expect(checkIndex).toBeGreaterThan(dividerIndex);
  });

  it('marks the reviews icon as active on the Reviews screen', () => {
    const html = renderFooter(state({ screen: 'reviews' }));
    const btnStart = html.indexOf('id="kb-show-reviews-btn"');
    const tagStart = html.lastIndexOf('<button', btnStart);
    const tag = html.slice(tagStart, html.indexOf('>', btnStart));
    expect(tag).toContain('kb-footer-btn-active');
  });
});
