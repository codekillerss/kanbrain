import type { DevelopmentLink, PullRequestDetails } from '../types';
import { escapeHtml } from './escapeHtml';

const BRANCH_FORK_ICON_PATH =
  'M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z';

function renderBranchForkIcon(fill: string): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${BRANCH_FORK_ICON_PATH}" fill="${fill}"/></svg>`;
}

function renderPullRequestIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M6 15.5V9a3 3 0 0 1 3-3h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3l4 3-4 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const BRANCH_FORK_ICON = renderBranchForkIcon('currentColor');
const PULL_REQUEST_ICON = renderPullRequestIcon();
const BADGE_ICON_COLOR = '#EAA300';
const INITIAL_VISIBLE = 3;
const BATCH_SIZE = 5;

export function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function renderDevelopmentItem(link: DevelopmentLink, prDetails: Record<string, PullRequestDetails>): string {
  if (link.kind === 'branch') {
    const name = escapeHtml(link.branchName);
    const commandArgs = encodeURIComponent(JSON.stringify([link.repositoryId, link.branchName]));
    return `<a class="kb-dev-item" href="command:kanbrain.checkoutBranch?${commandArgs}" title="${name}">${BRANCH_FORK_ICON}<span class="kb-dev-item-text">${name}</span></a>`;
  }
  const details = prDetails[`${link.repositoryId}:${link.pullRequestId}`];
  const label = details
    ? `#${link.pullRequestId} ${escapeHtml(details.title)} (${escapeHtml(capitalize(details.status))})`
    : `#${link.pullRequestId}`;
  const commandArgs = encodeURIComponent(JSON.stringify([link.repositoryId, link.pullRequestId]));
  return `<a class="kb-dev-item" href="command:kanbrain.openPullRequestDetail?${commandArgs}" title="${label}">${PULL_REQUEST_ICON}<span class="kb-dev-item-text">${label}</span></a>`;
}

function renderMoreBatches(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>, startIndex: number): string {
  if (startIndex >= development.length) {
    return '';
  }
  const batch = development.slice(startIndex, startIndex + BATCH_SIZE);
  const checkboxId = `kb-dev-more-${startIndex}`;
  return `
    <input type="checkbox" id="${checkboxId}" class="kb-dev-more-toggle" />
    <div class="kb-dev-extra">
      ${batch.map(link => renderDevelopmentItem(link, prDetails)).join('')}
      ${renderMoreBatches(development, prDetails, startIndex + BATCH_SIZE)}
    </div>
    <label for="${checkboxId}" class="kb-dev-more-btn">See more</label>
  `;
}

export function renderDevelopmentSection(development: DevelopmentLink[], prDetails: Record<string, PullRequestDetails>): string {
  if (development.length === 0) {
    return '';
  }
  const visible = development.slice(0, INITIAL_VISIBLE);
  return `
    <div class="kb-detail-group">
      <div class="kb-detail-group-label kb-dev-label">${BRANCH_FORK_ICON}<span>Development</span></div>
      ${visible.map(link => renderDevelopmentItem(link, prDetails)).join('')}
      ${renderMoreBatches(development, prDetails, INITIAL_VISIBLE)}
    </div>
  `;
}

export function renderDevelopmentBadge(development: DevelopmentLink[]): string {
  if (development.length === 0) {
    return '';
  }
  return `
    <div class="kb-field-row kb-dev-badge">
      ${renderBranchForkIcon(BADGE_ICON_COLOR)}<span>${development.length}</span>
    </div>
  `;
}
