import { describe, it, expect } from 'vitest';
import { sidebarCsp } from './sidebarCsp';

function directive(csp: string, name: string): string | undefined {
  return csp
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name} `) || part === name);
}

describe('sidebarCsp', () => {
  it('denies everything by default', () => {
    expect(directive(sidebarCsp('abc123'), 'default-src')).toBe("default-src 'none'");
  });

  it('only allows scripts carrying the given nonce', () => {
    const scriptSrc = directive(sidebarCsp('abc123'), 'script-src');
    expect(scriptSrc).toBe("script-src 'nonce-abc123'");
  });

  it('keeps inline styles working, since the markup relies on style attributes', () => {
    expect(directive(sidebarCsp('abc123'), 'style-src')).toBe("style-src 'unsafe-inline'");
  });

  it('allows data: images (resolved avatars) and https images', () => {
    expect(directive(sidebarCsp('abc123'), 'img-src')).toBe('img-src data: https:');
  });
});
