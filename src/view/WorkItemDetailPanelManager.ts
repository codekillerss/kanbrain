import * as vscode from 'vscode';
import type { WorkItem, KanbrainConfig, DevelopmentLink, PullRequestDetails } from '../types';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemComment } from '../azureDevOps/workItemDetail';
import { resolveDetailFields } from '../azureDevOps/workItemDetail';
import { readConfig } from '../config/config';
import { renderWorkItemDetail } from './renderWorkItemDetail';

export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();
  private avatarCache = new Map<string, string | null>();
  private prCache = new Map<string, PullRequestDetails | null>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
  ) {}

  async open(id: number): Promise<void> {
    const existing = this.panels.get(id);
    if (existing) {
      existing.reveal();
      return;
    }

    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return;
    }

    const [layout, rawFields, comments, parentResult, children] = await Promise.all([
      this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type),
      this.client.getWorkItemRawFields(config.organization, config.project, id),
      this.client.getComments(config.organization, config.project, id).catch(() => []),
      workItem.parentId ? this.client.getWorkItems(config.organization, config.project, [workItem.parentId]) : Promise.resolve([]),
      this.client.getChildren(config.organization, config.project, workItem),
    ]);
    const parent = parentResult[0] ?? null;

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    const [avatars, prDetails] = await Promise.all([
      this.resolveAvatars(workItem, comments),
      this.resolvePullRequestDetails(workItem, config),
    ]);

    const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${workItem.id} ${workItem.title}`, vscode.ViewColumn.Active, {
      enableScripts: false,
    });
    panel.webview.html = this.wrapHtml(
      renderWorkItemDetail({
        workItem,
        config,
        description: typeof rawFields['System.Description'] === 'string' ? (rawFields['System.Description'] as string) : null,
        groups,
        htmlSections,
        comments,
        avatars,
        prDetails,
        parent,
        children,
      }),
    );
    panel.onDidDispose(() => this.panels.delete(id));
    this.panels.set(id, panel);
  }

  private async resolveAvatars(workItem: WorkItem, comments: WorkItemComment[]): Promise<Record<string, string>> {
    const urls = [
      ...new Set([workItem.assignedTo?.imageUrl, ...comments.map(c => c.createdBy.imageUrl)].filter((u): u is string => !!u)),
    ];
    const uncached = urls.filter(u => !this.avatarCache.has(u));
    await Promise.all(
      uncached.map(async url => {
        this.avatarCache.set(url, await this.client.getAvatarDataUri(url));
      }),
    );
    const resolved: Record<string, string> = {};
    for (const url of urls) {
      const dataUri = this.avatarCache.get(url);
      if (dataUri) {
        resolved[url] = dataUri;
      }
    }
    return resolved;
  }

  private async resolvePullRequestDetails(workItem: WorkItem, config: KanbrainConfig): Promise<Record<string, PullRequestDetails>> {
    const prLinks = workItem.development.filter((d): d is Extract<DevelopmentLink, { kind: 'pullRequest' }> => d.kind === 'pullRequest');
    const uncached = prLinks.filter(link => !this.prCache.has(`${link.repositoryId}:${link.pullRequestId}`));

    await Promise.all(
      uncached.map(async link => {
        const key = `${link.repositoryId}:${link.pullRequestId}`;
        this.prCache.set(key, await this.client.getPullRequest(config.organization, config.project, link.repositoryId, link.pullRequestId));
      }),
    );

    const resolved: Record<string, PullRequestDetails> = {};
    for (const link of prLinks) {
      const key = `${link.repositoryId}:${link.pullRequestId}`;
      const details = this.prCache.get(key);
      if (details) {
        resolved[key] = details;
      }
    }
    return resolved;
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;">
  <style>${this.css()}</style>
</head>
<body>
  ${body}
</body>
</html>`;
  }

  private css(): string {
    return `
      body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px 24px; }
      .kb-detail-header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; margin-bottom: 16px; }
      .kb-detail-title-row { display: flex; align-items: center; gap: 8px; }
      .kb-detail-title-row .kb-type-icon { width: 22px; height: 22px; }
      .kb-type-icon { display: inline-flex; width: 14px; height: 14px; flex-shrink: 0; }
      .kb-type-icon svg { width: 100%; height: 100%; }
      .kb-detail-id { font-weight: 600; font-size: 16px; opacity: 0.75; flex-shrink: 0; }
      .kb-detail-title { font-size: 22px; margin: 0; }
      .kb-detail-status-row { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.75; margin-top: 6px; }
      .kb-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .kb-detail-assignee { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.9; }
      .kb-detail-body { display: flex; flex-wrap: wrap; gap: 24px; }
      .kb-detail-main { flex: 2 1 420px; min-width: 0; }
      .kb-detail-side { flex: 1 1 260px; min-width: 0; }
      .kb-detail-html-section { margin-bottom: 20px; }
      .kb-detail-section-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 8px; }
      .kb-detail-html-body { line-height: 1.5; }
      .kb-detail-html-body img { max-width: 100%; }
      .kb-detail-group { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin-bottom: 12px; }
      .kb-detail-group-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 8px; }
      .kb-detail-field { margin-bottom: 8px; }
      .kb-detail-field-label { font-size: 11px; opacity: 0.7; }
      .kb-detail-field-value { font-size: 13px; }
      .kb-related-subgroup-label { font-size: 11px; font-weight: 600; opacity: 0.7; margin: 8px 0 4px; }
      .kb-related-subgroup-label:first-child { margin-top: 0; }
      .kb-related-item { display: flex; align-items: center; gap: 4px; font-size: 13px; margin-bottom: 4px; }
      .kb-related-id { font-weight: 600; flex-shrink: 0; }
      .kb-detail-tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 11px; }
      .kb-avatar { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
      .kb-avatar-initial { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 9px; flex-shrink: 0; }
      .kb-empty { opacity: 0.7; }
      .kb-comments { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
      .kb-comment { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; }
      .kb-comment-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; }
      .kb-comment-author { font-weight: 600; }
      .kb-comment-date { opacity: 0.7; }
      .kb-comment-body { line-height: 1.5; }
      .kb-dev-label { display: flex; align-items: center; gap: 4px; }
      .kb-dev-item { display: flex; align-items: center; gap: 4px; font-size: 12px; margin-top: 4px; opacity: 0.85; }
      .kb-dev-item svg { flex-shrink: 0; }
      .kb-dev-item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kb-dev-more-toggle { display: none; }
      .kb-dev-extra { display: none; }
      .kb-dev-more-toggle:checked + .kb-dev-extra { display: block; }
      .kb-dev-more-toggle:checked ~ .kb-dev-more-btn { display: none; }
      .kb-dev-more-btn { display: inline-block; margin-top: 4px; font-size: 12px; color: var(--vscode-textLink-foreground); cursor: pointer; }
      .kb-dev-more-btn:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
    `;
  }
}
