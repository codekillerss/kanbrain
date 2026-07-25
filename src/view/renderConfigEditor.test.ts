import { describe, it, expect } from 'vitest';
import { renderConfigEditor } from './renderConfigEditor';
import type { KanbrainConfig } from '../types';

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

describe('renderConfigEditor', () => {
  it('shows an empty message when there are no work item types configured', () => {
    expect(renderConfigEditor(config())).toContain('No work item types configured yet.');
  });

  it('renders one row per status with data-level/data-status attributes', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null, Done: null } } }));

    expect(html).toContain('data-level="Task"');
    expect(html).toContain('data-status="To Do"');
    expect(html).toContain('data-status="Done"');
  });

  it('leaves the fields empty when the entry is null', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('data-field="path" placeholder="Skill file path" value=""');
  });

  it('fills the fields from the skill entry when one is set', () => {
    const html = renderConfigEditor(
      config({
        skills: {
          Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
        },
      }),
    );

    expect(html).toContain('value=".kanbrain/skills/task-todo.md"');
    expect(html).toContain('value="Refine"');
    expect(html).toContain('value="ffffff"');
    expect(html).toContain('value="007acc"');
  });

  it('escapes HTML in type, status, and field values', () => {
    const html = renderConfigEditor(config({ skills: { '<Task>': { '<To Do>': { path: '<script>' } } } }));

    expect(html).toContain('&lt;Task&gt;');
    expect(html).toContain('&lt;To Do&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a status dot when a color is known for the status', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } }, statusColors: { 'To Do': 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows a picker button for each row', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('data-action="pick-skill-file"');
  });

  it('shows native color pickers for textColor and buttonColor set to the stored hex', () => {
    const html = renderConfigEditor(
      config({
        skills: {
          Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', textColor: 'ffffff', buttonColor: '007acc' } },
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
      config({ skills: { Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', buttonColor: 'not-a-color' } } } }),
    );

    const pickers = [...html.matchAll(/data-color-for="(textColor|buttonColor)" value="([^"]*)"/g)];
    expect(pickers).toHaveLength(2);
    for (const [, , value] of pickers) {
      expect(value).toBe('#000000');
    }
  });

  it('renders each type as a collapsible section with a chevron toggle header', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-header"');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-chevron');
  });

  it('starts each type body collapsed (kb-hidden) by default', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-body kb-hidden"');
  });

  it('shows the type icon and accent color in the group header when configured', () => {
    const html = renderConfigEditor(
      config({
        skills: { Task: { 'To Do': null } },
        typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
        typeColors: { Task: 'f2cb1d' },
      }),
    );

    expect(html).toContain('kb-type-icon');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('omits the icon and accent color when the type has none configured', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).not.toContain('kb-type-icon');
    expect(html).not.toContain('border-right');
  });

  it('renders a Global Skills section with one row per entry', () => {
    const html = renderConfigEditor(config({ globalSkills: { 'global-skill-1': { path: '.kanbrain/skills/effort.md', label: 'Avaliar Effort' } } }));

    expect(html).toContain('Global Skills');
    expect(html).toContain('data-global-skill-id="global-skill-1"');
    expect(html).toContain('value=".kanbrain/skills/effort.md"');
    expect(html).toContain('value="Avaliar Effort"');
  });

  it('shows the Global Skills section even when there are no work item types configured', () => {
    const html = renderConfigEditor(config());

    expect(html).toContain('No work item types configured yet.');
    expect(html).toContain('Global Skills');
    expect(html).toContain('data-action="add-global-skill"');
  });

  it('shows a remove button for each global skill row', () => {
    const html = renderConfigEditor(config({ globalSkills: { 'global-skill-1': { path: 'x.md' } } }));

    expect(html).toContain('data-action="remove-global-skill"');
    expect(html).toContain('data-global-skill-id="global-skill-1"');
  });

  it('shows a collapsed, colored toggle header for each global skill, with fields hidden until expanded', () => {
    const html = renderConfigEditor(
      config({
        globalSkills: { 'global-skill-1': { path: 'effort.md', label: 'Avaliar Effort', buttonColor: '007acc', textColor: 'ffffff' } },
      }),
    );

    expect(html).toContain('kb-global-skill-header');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('background-color: #007acc');
    expect(html).toContain('color: #ffffff');
    expect(html).toContain('Avaliar Effort');
    expect(html).toContain('kb-config-level-body kb-hidden');
  });

  it('falls back to the file name, or a placeholder when there is no path yet, as the collapsed header label', () => {
    const withPathOnly = renderConfigEditor(config({ globalSkills: { 'global-skill-1': { path: '.kanbrain/skills/effort.md' } } }));
    expect(withPathOnly).toContain('effort.md');

    const empty = renderConfigEditor(config({ globalSkills: { 'global-skill-1': { path: '' } } }));
    expect(empty).toContain('New global skill');
  });
});
