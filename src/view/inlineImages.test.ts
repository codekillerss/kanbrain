import { describe, it, expect } from 'vitest';
import { extractImageUrls, extractMarkdownImageUrls, rewriteImageSrcs } from './inlineImages';

describe('extractImageUrls', () => {
  it('extracts img src URLs hosted on dev.azure.com', () => {
    const html = '<p>before</p><img src="https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc?fileName=x.png"><p>after</p>';
    expect(extractImageUrls(html, 'myorg')).toEqual([
      'https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc?fileName=x.png',
    ]);
  });

  it('extracts img src URLs hosted on {organization}.visualstudio.com', () => {
    const html = '<img src="https://myorg.visualstudio.com/proj/_apis/wit/attachments/abc">';
    expect(extractImageUrls(html, 'myorg')).toEqual(['https://myorg.visualstudio.com/proj/_apis/wit/attachments/abc']);
  });

  it('ignores img src URLs hosted on other domains', () => {
    const html = '<img src="https://example.com/pic.png">';
    expect(extractImageUrls(html, 'myorg')).toEqual([]);
  });

  it('ignores a visualstudio.com host that belongs to a different org', () => {
    const html = '<img src="https://otherorg.visualstudio.com/proj/_apis/wit/attachments/abc">';
    expect(extractImageUrls(html, 'myorg')).toEqual([]);
  });

  it('dedupes repeated URLs', () => {
    const url = 'https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc';
    const html = `<img src="${url}"><p>text</p><img src="${url}">`;
    expect(extractImageUrls(html, 'myorg')).toEqual([url]);
  });

  it('returns an empty array when there are no img tags', () => {
    expect(extractImageUrls('<p>no images here</p>', 'myorg')).toEqual([]);
  });

  it('ignores an img tag with an unparseable src', () => {
    const html = '<img src="not a url">';
    expect(extractImageUrls(html, 'myorg')).toEqual([]);
  });
});

describe('extractMarkdownImageUrls', () => {
  it('extracts URLs from markdown image syntax hosted on dev.azure.com', () => {
    const text = 'before ![image.png](https://dev.azure.com/codekillers/proj/_apis/git/repositories/repo-1/pullRequests/2/attachments/image.png) after';
    expect(extractMarkdownImageUrls(text, 'codekillers')).toEqual([
      'https://dev.azure.com/codekillers/proj/_apis/git/repositories/repo-1/pullRequests/2/attachments/image.png',
    ]);
  });

  it('extracts URLs from markdown image syntax hosted on {organization}.visualstudio.com', () => {
    const text = '![x](https://myorg.visualstudio.com/proj/_apis/git/repositories/repo-1/pullRequests/2/attachments/x.png)';
    expect(extractMarkdownImageUrls(text, 'myorg')).toEqual([
      'https://myorg.visualstudio.com/proj/_apis/git/repositories/repo-1/pullRequests/2/attachments/x.png',
    ]);
  });

  it('ignores markdown images hosted on other domains', () => {
    const text = '![x](https://example.com/pic.png)';
    expect(extractMarkdownImageUrls(text, 'myorg')).toEqual([]);
  });

  it('dedupes repeated URLs', () => {
    const url = 'https://dev.azure.com/myorg/proj/_apis/git/repositories/repo-1/pullRequests/2/attachments/x.png';
    const text = `![x](${url}) and again ![x](${url})`;
    expect(extractMarkdownImageUrls(text, 'myorg')).toEqual([url]);
  });

  it('returns an empty array when there is no markdown image syntax', () => {
    expect(extractMarkdownImageUrls('just plain text', 'myorg')).toEqual([]);
  });
});

describe('rewriteImageSrcs', () => {
  const url = 'https://dev.azure.com/myorg/proj/_apis/wit/attachments/abc';

  it('replaces the src with the resolved data URI', () => {
    const html = `<p>before</p><img src="${url}" alt="x"><p>after</p>`;
    const result = rewriteImageSrcs(html, { [url]: 'data:image/png;base64,ABC' });
    expect(result).toBe('<p>before</p><img src="data:image/png;base64,ABC" alt="x"><p>after</p>');
  });

  it('replaces the tag with a placeholder when resolution failed (null)', () => {
    const html = `<img src="${url}">`;
    const result = rewriteImageSrcs(html, { [url]: null });
    expect(result).toBe('<span class="kb-image-unavailable">🖼 imagem indisponível</span>');
  });

  it('leaves the tag unchanged when the URL is not in the images map', () => {
    const html = '<img src="https://example.com/pic.png">';
    const result = rewriteImageSrcs(html, {});
    expect(result).toBe(html);
  });

  it('leaves html with no img tags unchanged', () => {
    const html = '<p>just text</p>';
    expect(rewriteImageSrcs(html, {})).toBe(html);
  });
});
