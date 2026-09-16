import { describe, it, expect } from 'vitest';
import { renderSkillsEditor } from './renderSkillsEditor';

describe('renderSkillsEditor', () => {
  it('shows an empty message when there are no skills configured', () => {
    expect(renderSkillsEditor({})).toContain('No skills configured yet.');
  });

  it('renders one row per entry with a data-skill-id attribute', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: '.kanbrain/skills/effort.md', label: 'Avaliar Effort' } });

    expect(html).toContain('data-skill-id="skill-1"');
    expect(html).toContain('value=".kanbrain/skills/effort.md"');
    expect(html).toContain('value="Avaliar Effort"');
  });

  it('escapes HTML in the id and field values', () => {
    const html = renderSkillsEditor({ '<skill>': { path: '<script>', label: '<b>x</b>' } });

    expect(html).toContain('&lt;skill&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x</b>');
  });

  it('shows a picker button for each row', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: '' } });
    expect(html).toContain('data-action="pick-skill-file"');
  });

  it('shows native color pickers for textColor and buttonColor set to the stored hex', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md', textColor: 'ffffff', buttonColor: '007acc' } });

    expect(html).toContain('type="color"');
    expect(html).toContain('data-color-for="textColor"');
    expect(html).toContain('data-color-for="buttonColor"');
    expect(html).toContain('value="#ffffff"');
    expect(html).toContain('value="#007acc"');
  });

  it('defaults color pickers to black when the hex field is empty or invalid', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md', buttonColor: 'not-a-color' } });

    const pickers = [...html.matchAll(/data-color-for="(textColor|buttonColor)" value="([^"]*)"/g)];
    expect(pickers).toHaveLength(2);
    for (const [, , value] of pickers) {
      expect(value).toBe('#000000');
    }
  });

  it('shows a red remove button for each skill row, outside the collapsible body so it stays visible when collapsed', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md' } });

    expect(html).toContain('data-action="remove-skill"');
    expect(html).toContain('data-skill-id="skill-1"');
    expect(html).toContain('kb-icon-btn-danger');
    const bodyEnd = html.indexOf('kb-config-level-body');
    const removeButtonIndex = html.indexOf('data-action="remove-skill"');
    expect(removeButtonIndex).toBeGreaterThan(html.indexOf('</div>', bodyEnd));
  });

  it('renders the label field before the path field', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md', label: 'Fix it' } });

    expect(html.indexOf('data-field="label"')).toBeLessThan(html.indexOf('data-field="path"'));
  });

  it('shows a Global checkbox reflecting isGlobal, unchecked by default', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md' } });

    expect(html).toContain('data-field="isGlobal"');
    expect(html).not.toMatch(/data-field="isGlobal"[^>]*checked/);
  });

  it('checks the Global checkbox when isGlobal is true', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md', isGlobal: true } });

    expect(html).toMatch(/data-field="isGlobal"[^>]*checked/);
  });

  it('renders the Global checkbox after the color fields, as the last field in the row', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md', label: 'Fix it', textColor: 'fff', buttonColor: '000' } });

    expect(html.indexOf('data-field="isGlobal"')).toBeGreaterThan(html.indexOf('data-field="buttonColor"'));
  });

  it('explains the Global checkbox via a hover tooltip on an info icon, not inline text', () => {
    const html = renderSkillsEditor({ 'skill-1': { path: 'x.md' } });

    expect(html).toContain('kb-info-icon');
    expect(html).toContain('title="Shows in the &quot;▾&quot; menu on every card, regardless of status"');
    expect(html).not.toContain('Global (shows');
  });

  it('shows a collapsed, colored toggle header for each skill, with fields hidden until expanded', () => {
    const html = renderSkillsEditor({
      'skill-1': { path: 'effort.md', label: 'Avaliar Effort', buttonColor: '007acc', textColor: 'ffffff' },
    });

    expect(html).toContain('kb-global-skill-header');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('background-color: #007acc');
    expect(html).toContain('color: #ffffff');
    expect(html).toContain('Avaliar Effort');
    expect(html).toContain('kb-config-level-body kb-hidden');
  });

  it('falls back to the file name, or a placeholder when there is no path yet, as the collapsed header label', () => {
    const withPathOnly = renderSkillsEditor({ 'skill-1': { path: '.kanbrain/skills/effort.md' } });
    expect(withPathOnly).toContain('effort.md');

    const empty = renderSkillsEditor({ 'skill-1': { path: '' } });
    expect(empty).toContain('New skill');
  });
});
