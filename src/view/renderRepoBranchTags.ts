import type { RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';

const BRANCH_ICON_PATH =
  'M11 5.5C11 7.26324 9.69615 8.72194 8 8.96456V11.5H14.25C15.4926 11.5 16.5 10.4926 16.5 9.25V8.85506C15.0543 8.42479 14 7.08551 14 5.5C14 3.567 15.567 2 17.5 2C19.433 2 21 3.567 21 5.5C21 7.26324 19.6961 8.72194 18 8.96456V9.25C18 11.3211 16.3211 13 14.25 13H8V15.0354C9.69615 15.2781 11 16.7368 11 18.5C11 20.433 9.433 22 7.5 22C5.567 22 4 20.433 4 18.5C4 16.9145 5.05426 15.5752 6.5 15.1449V8.85506C5.05426 8.42479 4 7.08551 4 5.5C4 3.567 5.567 2 7.5 2C9.433 2 11 3.567 11 5.5ZM7.5 7.5C8.60457 7.5 9.5 6.60457 9.5 5.5C9.5 4.39543 8.60457 3.5 7.5 3.5C6.39543 3.5 5.5 4.39543 5.5 5.5C5.5 6.60457 6.39543 7.5 7.5 7.5ZM17.5 7.5C18.6046 7.5 19.5 6.60457 19.5 5.5C19.5 4.39543 18.6046 3.5 17.5 3.5C16.3954 3.5 15.5 4.39543 15.5 5.5C15.5 6.60457 16.3954 7.5 17.5 7.5ZM9.5 18.5C9.5 17.3954 8.60457 16.5 7.5 16.5C6.39543 16.5 5.5 17.3954 5.5 18.5C5.5 19.6046 6.39543 20.5 7.5 20.5C8.60457 20.5 9.5 19.6046 9.5 18.5Z';

const BRANCH_ICON = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${BRANCH_ICON_PATH}" fill="currentColor"/></svg>`;

const REPO_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="2"/><line x1="8.5" y1="3" x2="8.5" y2="21" stroke="currentColor" stroke-width="2"/></svg>';

export function renderBranchTag(branchName: string, checkoutCommandArgs: [string, string] | null): string {
  const text = escapeHtml(branchName);
  if (!checkoutCommandArgs) {
    return `<span class="kb-branch-tag kb-branch-tag-disabled" title="${text} — no local path configured">${BRANCH_ICON}${text}</span>`;
  }
  const commandArgs = encodeURIComponent(JSON.stringify(checkoutCommandArgs));
  return `<a class="kb-branch-tag" href="command:kanbrain.checkoutBranch?${commandArgs}" title="Check out ${text}">${BRANCH_ICON}${text}</a>`;
}

export function renderRepoTag(repositoryId: string, entry: RepositoryPathEntry | undefined): string {
  if (entry?.path) {
    return `<span class="kb-repo-tag kb-repo-tag-mapped" title="${escapeHtml(entry.name)}">${REPO_ICON}${escapeHtml(entry.name)}</span>`;
  }
  const label = entry ? entry.name : 'Unknown repository';
  const text = escapeHtml(label);
  const commandArgs = encodeURIComponent(JSON.stringify([repositoryId]));
  return `<a class="kb-repo-tag kb-repo-tag-unmapped" href="command:kanbrain.resolveRepositoryTag?${commandArgs}" title="${text} — click to configure">${REPO_ICON}${text}</a>`;
}
