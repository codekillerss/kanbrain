import { describe, it, expect } from 'vitest';
import { renderMarkdownText } from './renderMarkdownText';

describe('renderMarkdownText', () => {
  it('escapes plain text with no markdown images', () => {
    expect(renderMarkdownText('<b>Looks good!</b>')).toBe('&lt;b&gt;Looks good!&lt;/b&gt;');
  });

  it('converts markdown image syntax into an img tag', () => {
    const url = 'https://dev.azure.com/codekillers/proj/_apis/git/repositories/repo-1/pullRequests/2/attachments/image.png';
    expect(renderMarkdownText(`![image.png](${url})`)).toBe(`<img src="${url}" alt="image.png">`);
  });

  it('escapes the alt text of a markdown image', () => {
    const url = 'https://dev.azure.com/codekillers/proj/attachments/x.png';
    expect(renderMarkdownText(`![<b>x</b>](${url})`)).toBe(`<img src="${url}" alt="&lt;b&gt;x&lt;/b&gt;">`);
  });

  it('escapes surrounding text while converting an embedded markdown image', () => {
    const url = 'https://dev.azure.com/codekillers/proj/attachments/x.png';
    const result = renderMarkdownText(`before <b> ![x](${url}) </b> after`);
    expect(result).toBe(`before &lt;b&gt; <img src="${url}" alt="x"> &lt;/b&gt; after`);
  });

  it('converts multiple markdown images in the same text', () => {
    const result = renderMarkdownText('![a](https://example.com/a.png) and ![b](https://example.com/b.png)');
    expect(result).toBe('<img src="https://example.com/a.png" alt="a"> and <img src="https://example.com/b.png" alt="b">');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdownText('')).toBe('');
  });
});
