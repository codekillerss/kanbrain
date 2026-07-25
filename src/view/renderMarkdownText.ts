import { escapeHtml } from './escapeHtml';

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export function renderMarkdownText(text: string): string {
  let html = '';
  let lastIndex = 0;
  for (const match of text.matchAll(MD_IMAGE_RE)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(lastIndex, index));
    const [, alt, url] = match;
    html += `<img src="${url}" alt="${escapeHtml(alt)}">`;
    lastIndex = index + match[0].length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}
