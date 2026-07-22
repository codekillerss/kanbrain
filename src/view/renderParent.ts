import type { WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderParentRow(parent: WorkItem | null, show: boolean): string {
  if (!show || !parent) {
    return '';
  }
  return `<div class="kb-parent-row" data-action="open-work-item-detail" data-id="${parent.id}">↑ Parent: #${parent.id} ${escapeHtml(parent.title)}</div>`;
}
