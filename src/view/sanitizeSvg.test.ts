import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from './sanitizeSvg';

describe('sanitizeSvg', () => {
  it('removes script tags', () => {
    const svg = '<svg><script>alert(1)</script><circle r="1"/></svg>';
    expect(sanitizeSvg(svg)).not.toContain('<script');
    expect(sanitizeSvg(svg)).toContain('<circle');
  });

  it('removes inline event handler attributes', () => {
    const svg = '<svg onload="alert(1)"><rect onclick="alert(2)" width="1"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('onclick');
    expect(result).toContain('<rect');
  });

  it('leaves a clean svg unchanged in structure', () => {
    const svg = '<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" fill="#cc293d"/></svg>';
    expect(sanitizeSvg(svg)).toContain('<path d="M0 0h16v16H0z" fill="#cc293d"/>');
  });
});
