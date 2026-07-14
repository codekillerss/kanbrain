import { describe, it, expect } from 'vitest';
import { renderColoredBadge } from './renderColoredBadge';

describe('renderColoredBadge', () => {
  it('renders a plain badge when no color is known', () => {
    const html = renderColoredBadge('Active', undefined, 'kb-status');
    expect(html).toContain('kb-badge kb-status');
    expect(html).toContain('Active');
    expect(html).not.toContain('background-color');
  });

  it('renders a colored background with a computed readable text color', () => {
    const html = renderColoredBadge('Active', 'cc293d', 'kb-status');
    expect(html).toContain('background-color: #cc293d');
    expect(html).toContain('color: #ffffff');
  });

  it('escapes the badge text', () => {
    const html = renderColoredBadge('<b>Active</b>', undefined, 'kb-status');
    expect(html).toContain('&lt;b&gt;Active&lt;/b&gt;');
    expect(html).not.toContain('<b>Active</b>');
  });

  it('includes the icon markup before the text when provided', () => {
    const html = renderColoredBadge('Bug', 'cc293d', 'kb-type', '<svg><path d="M0 0"/></svg>');
    const iconIndex = html.indexOf('<svg>');
    const textIndex = html.indexOf('Bug');
    expect(iconIndex).toBeGreaterThan(-1);
    expect(iconIndex).toBeLessThan(textIndex);
  });
});
