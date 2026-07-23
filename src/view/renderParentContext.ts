import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';

const MAX_VISIBLE_DOTS = 5;

export function renderParentBanner(parent: WorkItem | null, config: KanbrainConfig): string {
  if (!parent) {
    return '';
  }
  const { iconHtml } = renderTypeAccent(parent.type, config);
  return `
    <div class="kb-parent-banner" data-action="open-work-item-detail" data-id="${parent.id}">
      ${iconHtml}<span class="kb-link-text">#${parent.id}: ${escapeHtml(parent.title)}</span>
      <button type="button" class="kb-icon-btn kb-pick-btn" data-action="pick-work-item" data-id="${parent.id}" title="Set as current work item">⇄</button>
    </div>
  `;
}

function renderArrow(direction: 'prev' | 'next', siblingId: number | null): string {
  const symbol = direction === 'prev' ? '‹' : '›';
  const className = `kb-sibling-arrow kb-sibling-arrow-${direction}`;
  if (siblingId === null) {
    return `<button type="button" class="${className}" disabled>${symbol}</button>`;
  }
  return `<button type="button" class="${className}" data-action="pick-work-item" data-id="${siblingId}">${symbol}</button>`;
}

export function renderSiblingNavigator(workItem: WorkItem, parent: WorkItem | null): string {
  if (!parent) {
    return '';
  }
  const siblings = parent.childIds;
  const currentIndex = siblings.indexOf(workItem.id);
  if (currentIndex === -1) {
    return '';
  }

  const prevId = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextId = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const windowSize = Math.min(MAX_VISIBLE_DOTS, siblings.length);
  const start = Math.min(
    Math.max(0, currentIndex - Math.floor(windowSize / 2)),
    Math.max(0, siblings.length - windowSize),
  );
  const windowIds = siblings.slice(start, start + windowSize);

  const dotsHtml = windowIds
    .map(id => `<span class="kb-sibling-dot${id === workItem.id ? ' kb-sibling-dot-active' : ''}"></span>`)
    .join('');

  return `
    <div class="kb-sibling-nav">
      ${renderArrow('prev', prevId)}
      <div class="kb-sibling-dots">${dotsHtml}</div>
      ${renderArrow('next', nextId)}
    </div>
  `;
}
