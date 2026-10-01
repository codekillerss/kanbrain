import { describe, it, expect } from 'vitest';
import { detailPanelCss } from './detailPanelCss';

// Every declaration from the rules whose selector list includes `selector`.
function rule(selector: string): string {
  const css = detailPanelCss().replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some(s => s.trim() === selector))
    .map(([, , declarations]) => declarations)
    .join(';');
}

// Descriptions and comments are Azure DevOps HTML: long unbroken URLs, <pre> blocks, tables and
// inline fixed widths. Without containment they spill out of the main column and paint over the
// side column (State, Work item type, Assigned To, Area Path...).
describe('detailPanelCss containment of Azure DevOps HTML', () => {
  for (const body of ['.kb-detail-html-body', '.kb-comment-body']) {
    it(`breaks long words and scrolls wide content inside ${body} instead of overflowing`, () => {
      expect(rule(body)).toContain('overflow-wrap: anywhere');
      expect(rule(body)).toContain('overflow-x: auto');
    });

    it(`wraps preformatted text inside ${body}`, () => {
      expect(rule(`${body} pre`)).toContain('white-space: pre-wrap');
    });

    it(`keeps images inside ${body} proportional while capping their width`, () => {
      expect(rule(`${body} img`)).toContain('max-width: 100%');
      expect(rule(`${body} img`)).toContain('height: auto');
    });
  }

  it('breaks long values (e.g. an area path) in the side column fields', () => {
    expect(rule('.kb-detail-field-value')).toContain('overflow-wrap: anywhere');
  });
});
