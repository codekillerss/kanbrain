import type { WorkItem, KanbrainConfig, PullRequestDetail, PullRequestReviewer, PullRequestThread, PullRequestThreadComment } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';
import { capitalize } from './renderDevelopment';
import { renderComment } from './renderComment';

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

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--vscode-charts-blue)',
  completed: 'var(--vscode-charts-green)',
  abandoned: 'var(--vscode-charts-red)',
};

function renderStatusDot(status: string, isDraft: boolean): string {
  const color = isDraft ? 'var(--vscode-charts-yellow)' : (STATUS_COLORS[status] ?? 'var(--vscode-charts-blue)');
  return `<span class="kb-status-dot" style="background-color: ${color}"></span>`;
}

function renderReviewer(reviewer: PullRequestReviewer): string {
  const requirementTag = reviewer.isRequired
    ? '<span class="kb-pr-required-tag">Required</span>'
    : '<span class="kb-pr-optional-tag">Optional</span>';
  return `<div class="kb-pr-reviewer"><span>${escapeHtml(reviewer.displayName)}</span><span class="kb-pr-vote">${renderVoteLabel(reviewer.vote)}</span>${requirementTag}</div>`;
}

function renderBranchLink(repositoryId: string, branchName: string): string {
  const commandArgs = encodeURIComponent(JSON.stringify([repositoryId, branchName]));
  return `<a class="kb-pr-branch-link" href="command:kanbrain.checkoutBranch?${commandArgs}" title="Check out ${escapeHtml(branchName)}">${escapeHtml(branchName)}</a>`;
}

const THREAD_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  fixed: 'Fixed',
  wontFix: "Won't Fix",
  closed: 'Closed',
  byDesign: 'By Design',
  pending: 'Pending',
};

function renderThread(thread: PullRequestThread, avatars: Record<string, string>): string {
  const roots = thread.comments.filter(c => !c.parentCommentId);
  const repliesByParent = new Map<number, PullRequestThreadComment[]>();
  for (const c of thread.comments) {
    if (c.parentCommentId) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }

  const fileLabel = thread.filePath
    ? `<div class="kb-pr-thread-file">📄 ${escapeHtml(thread.filePath)}${thread.line ? `:${thread.line}` : ''}</div>`
    : '';
  const statusLabel = THREAD_STATUS_LABELS[thread.status]
    ? `<span class="kb-pr-thread-status">${THREAD_STATUS_LABELS[thread.status]}</span>`
    : '';

  // PR thread comment content is plain text/Markdown, unlike work item comments (already-safe HTML
  // from Azure DevOps' rich text editor) — escape it before handing it to renderComment, which only
  // strips <script> tags and otherwise trusts its input as HTML.
  const commentsHtml = roots
    .map(root => {
      const replyHtml = (repliesByParent.get(root.id) ?? [])
        .map(r => `<div class="kb-pr-reply">${renderComment({ ...r, text: escapeHtml(r.text) }, avatars)}</div>`)
        .join('');
      return renderComment({ ...root, text: escapeHtml(root.text) }, avatars) + replyHtml;
    })
    .join('');

  return `
    <div class="kb-pr-thread">
      ${fileLabel || statusLabel ? `<div class="kb-pr-thread-header">${fileLabel}${statusLabel}</div>` : ''}
      ${commentsHtml}
    </div>
  `;
}

function renderLinkedWorkItem(item: WorkItem, config: KanbrainConfig): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  const detailCommandArgs = encodeURIComponent(JSON.stringify([item.id]));
  const pickCommandArgs = encodeURIComponent(JSON.stringify([item.id]));
  return `
    <div class="kb-related-item-row">
      <a class="kb-related-item" href="command:kanbrain.openWorkItemDetail?${detailCommandArgs}">
        ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
      </a>
      <a class="kb-pick-link" href="command:kanbrain.pickWorkItem?${pickCommandArgs}" title="Set as current work item">&#8644;</a>
    </div>
  `;
}

function renderDiffAction(pr: PullRequestDetail, gitLensIconDataUri: string | null): string {
  if (gitLensIconDataUri) {
    const commandArgs = encodeURIComponent(JSON.stringify([pr.sourceBranch, pr.targetBranch]));
    return `<a class="kb-pr-diff-link" href="command:kanbrain.viewPullRequestDiff?${commandArgs}"><img class="kb-pr-gitlens-icon" src="${gitLensIconDataUri}" alt="" /> View Diff</a>`;
  }
  const installArgs = encodeURIComponent(JSON.stringify(['GitLens']));
  return `<a class="kb-pr-web-link" href="command:workbench.extensions.search?${installArgs}">💡 Install GitLens to view diffs inline</a>`;
}

export interface PullRequestDetailInput {
  pr: PullRequestDetail;
  workItems: WorkItem[];
  config: KanbrainConfig;
  threads: PullRequestThread[];
  avatars: Record<string, string>;
  gitLensIconDataUri: string | null;
}

export function renderPullRequestDetail(input: PullRequestDetailInput): string {
  const { pr, workItems, config, threads, avatars, gitLensIconDataUri } = input;
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);
  const threadsHtml = threads.length ? threads.map(t => renderThread(t, avatars)).join('') : '<div class="kb-empty">No comments.</div>';

  return `
    <div class="kb-detail-header">
      <div class="kb-detail-title-row">
        <h1 class="kb-detail-title">${escapeHtml(pr.title)}</h1>
      </div>
      <div class="kb-detail-status-row">${renderStatusDot(pr.status, pr.isDraft)}${escapeHtml(statusLabel)}</div>
      <div class="kb-pr-branches">${renderBranchLink(pr.repositoryId, pr.sourceBranch)} &rarr; ${renderBranchLink(pr.repositoryId, pr.targetBranch)}</div>
      <a class="kb-pr-web-link" href="${escapeHtml(pr.webUrl)}">Open in browser</a>
      ${renderDiffAction(pr, gitLensIconDataUri)}
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
    <div class="kb-detail-section-label">Discussion</div>
    <div class="kb-pr-threads">
      ${threadsHtml}
    </div>
  `;
}
