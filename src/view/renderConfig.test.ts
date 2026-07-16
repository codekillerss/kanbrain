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
});
