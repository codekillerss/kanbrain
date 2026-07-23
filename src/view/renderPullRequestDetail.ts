import type { WorkItem, KanbrainConfig, PullRequestDetail, PullRequestReviewer } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';
import { capitalize } from './renderDevelopment';

const VOTE_LABELS: Record<number, string> = {
  10: 'Approved',
  5: 'Approved with suggestions',
  0: 'No vote',
  '-5': 'Waiting for author',
  '-10': 'Rejected',
};

function renderVoteLabel(vote: number): string {
  return VOTE_LABELS[vote] ?? 'No vote';
}

function renderReviewer(reviewer: PullRequestReviewer): string {
  const requiredTag = reviewer.isRequired ? ' <span class="kb-pr-required-tag">Required</span>' : '';
  return `<div class="kb-pr-reviewer"><span>${escapeHtml(reviewer.displayName)}</span><span class="kb-pr-vote">${renderVoteLabel(reviewer.vote)}</span>${requiredTag}</div>`;
}

function renderLinkedWorkItem(item: WorkItem, config: KanbrainConfig): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  const commandArgs = encodeURIComponent(JSON.stringify([item.id]));
  return `
    <a class="kb-related-item" href="command:kanbrain.openWorkItemDetail?${commandArgs}">
      ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
    </a>
  `;
}

export interface PullRequestDetailInput {
  pr: PullRequestDetail;
  workItems: WorkItem[];
  config: KanbrainConfig;
}

export function renderPullRequestDetail(input: PullRequestDetailInput): string {
  const { pr, workItems, config } = input;
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);

  return `
    <div class="kb-detail-header">
      <div class="kb-detail-title-row">
        <h1 class="kb-detail-title">${escapeHtml(pr.title)}</h1>
      </div>
      <div class="kb-detail-status-row">${escapeHtml(statusLabel)}</div>
      <div class="kb-pr-branches">${escapeHtml(pr.sourceBranch)} &rarr; ${escapeHtml(pr.targetBranch)}</div>
      <a class="kb-pr-web-link" href="${escapeHtml(pr.webUrl)}">Open in browser</a>
    </div>
    <div class="kb-detail-body">
      <div class="kb-detail-main">
        <div class="kb-detail-html-section">
          <div class="kb-detail-section-label">Description</div>
          <div class="kb-detail-html-body kb-pr-description">${escapeHtml(pr.description)}</div>
        </div>
      </div>
      <div class="kb-detail-side">
        <div class="kb-detail-group">
          <div class="kb-detail-group-label">Reviewers</div>
          ${pr.reviewers.length ? pr.reviewers.map(renderReviewer).join('') : '<div class="kb-empty">No reviewers.</div>'}
        </div>
        ${
          workItems.length
            ? `<div class="kb-detail-group"><div class="kb-detail-group-label">Linked Work Items</div>${workItems.map(w => renderLinkedWorkItem(w, config)).join('')}</div>`
            : ''
        }
      </div>
    </div>
  `;
}
