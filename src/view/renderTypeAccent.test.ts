import { describe, it, expect } from 'vitest';
import { renderTypeAccent } from './renderTypeAccent';
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

describe('renderTypeAccent', () => {
  it('returns a border-right style when the type has a valid configured color', () => {
    const { borderStyle } = renderTypeAccent('Task', config({ typeColors: { Task: 'f2cb1d' } }));
    expect(borderStyle).toBe(' style="border-right: 4px solid #f2cb1d;"');
  });

  it('returns an empty border when the type has no configured color', () => {
    const { borderStyle } = renderTypeAccent('Task', config());
    expect(borderStyle).toBe('');
  });

  it('returns an empty border when the configured color is invalid', () => {
    const { borderStyle } = renderTypeAccent('Task', config({ typeColors: { Task: 'not-a-color' } }));
    expect(borderStyle).toBe('');
  });

  it('returns an icon span when the type has a configured icon', () => {
    const { iconHtml } = renderTypeAccent('Task', config({ typeIcons: { Task: '<svg><path d="M0 0"/></svg>' } }));
    expect(iconHtml).toBe('<span class="kb-type-icon"><svg><path d="M0 0"/></svg></span>');
  });

  it('returns an empty icon when the type has no configured icon', () => {
    const { iconHtml } = renderTypeAccent('Task', config());
    expect(iconHtml).toBe('');
  });
});
