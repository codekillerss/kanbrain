import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes ampersands, angle brackets, and double quotes', () => {
    expect(escapeHtml('<b>Tom & "Jerry"</b>')).toBe('&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});
