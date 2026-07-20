import { describe, it, expect } from 'vitest';
import { renderConfig } from './renderConfig';
import type { RenderState } from './render';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: {},
    backlogLevels: {},
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
    screen: 'config',
    ...overrides,
  };
}

describe('renderConfig', () => {
  it('shows a Home button', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-home-btn"');
  });

  it('renders the config editor', () => {
    const html = renderConfig(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Tasks"');
  });

  it('makes the header sticky', () => {
    const html = renderConfig(state());
    expect(html).toContain('kb-header kb-page-header');
  });

  it('shows a "Show assignee on cards" checkbox, checked by default', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-show-assignee-toggle"');
    expect(html).toContain('Show assignee on cards');
    expect(html).toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('unchecks the checkbox when showAssignedTo is false', () => {
    const html = renderConfig(state({ config: config({ showAssignedTo: false }) }));
    expect(html).not.toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('wraps Skill Configuration in a parent section container around the config editor', () => {
    const html = renderConfig(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));

    const parentIndex = html.indexOf('kb-config-parent-section');
    const headerIndex = html.indexOf('Skill Configuration');
    const levelIndex = html.indexOf('data-level="Tasks"');

    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeGreaterThan(parentIndex);
    expect(levelIndex).toBeGreaterThan(headerIndex);
  });
});
