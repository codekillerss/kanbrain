import { describe, it, expect } from 'vitest';
import { renderConfigEditor } from './renderConfigEditor';
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

describe('renderConfigEditor', () => {
  it('shows an empty message when there are no backlog levels', () => {
    expect(renderConfigEditor(config())).toContain('No backlog levels configured yet.');
  });

  it('renders one row per status with data-level/data-status attributes', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null, Done: null } } }));

    expect(html).toContain('data-level="Tasks"');
    expect(html).toContain('data-status="To Do"');
    expect(html).toContain('data-status="Done"');
  });

  it('leaves the fields empty when the entry is null', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } } }));

    expect(html).toContain('data-field="path" placeholder="Skill file path" value=""');
  });

  it('fills the fields from the skill entry when one is set', () => {
    const html = renderConfigEditor(
      config({
        backlogLevels: {
          Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
        },
      }),
    );

    expect(html).toContain('value=".kanbrain/skills/tasks-todo.md"');
    expect(html).toContain('value="Refine"');
    expect(html).toContain('value="ffffff"');
    expect(html).toContain('value="007acc"');
  });

  it('escapes HTML in level, status, and field values', () => {
    const html = renderConfigEditor(config({ backlogLevels: { '<Tasks>': { '<To Do>': { path: '<script>' } } } }));

    expect(html).toContain('&lt;Tasks&gt;');
    expect(html).toContain('&lt;To Do&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a status dot when a color is known for the status', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } }, statusColors: { 'To Do': 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows a picker button for each row', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } } }));

    expect(html).toContain('data-action="pick-skill-file"');
  });

  it('shows native color pickers for textColor and buttonColor set to the stored hex', () => {
    const html = renderConfigEditor(
      config({
        backlogLevels: {
          Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md', textColor: 'ffffff', buttonColor: '007acc' } },
        },
      }),
    );

    expect(html).toContain('type="color"');
    expect(html).toContain('data-color-for="textColor"');
    expect(html).toContain('data-color-for="buttonColor"');
    expect(html).toContain('value="#ffffff"');
    expect(html).toContain('value="#007acc"');
  });

  it('defaults color pickers to black when the hex field is empty or invalid', () => {
    const html = renderConfigEditor(
      config({ backlogLevels: { Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md', buttonColor: 'not-a-color' } } } }),
    );

    const pickers = [...html.matchAll(/data-color-for="(textColor|buttonColor)" value="([^"]*)"/g)];
    expect(pickers).toHaveLength(2);
    for (const [, , value] of pickers) {
      expect(value).toBe('#000000');
    }
  });
});
