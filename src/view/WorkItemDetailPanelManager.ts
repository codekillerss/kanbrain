import * as vscode from 'vscode';
import type { WorkItem, KanbrainConfig, DevelopmentLink, PullRequestDetails } from '../types';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemComment, WorkItemTypeLayout } from '../azureDevOps/workItemDetail';
import { resolveDetailFields } from '../azureDevOps/workItemDetail';
import { readConfig } from '../config/config';
import { renderWorkItemDetail } from './renderWorkItemDetail';
import { detailPanelCss } from './detailPanelCss';

const POLL_INTERVAL_MS = 5000;

export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();
  private avatarCache = new Map<string, string | null>();
  private prCache = new Map<string, PullRequestDetails | null>();
  private layoutCache = new Map<number, WorkItemTypeLayout | null>();
  private lastStateByPanel = new Map<number, string>();
  private pollHandle: ReturnType<typeof setInterval> | undefined;

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

    const panel = vscode.window.createWebviewPanel('kanbrain.workItemDetail', `#${id}`, vscode.ViewColumn.Active, {
      enableScripts: false,
      enableCommandUris: ['kanbrain.openWorkItemDetail', 'kanbrain.checkoutBranch', 'kanbrain.openPullRequestDetail'],
    });
    this.panels.set(id, panel);

    panel.onDidDispose(() => {
      this.panels.delete(id);
      this.lastStateByPanel.delete(id);
      this.layoutCache.delete(id);
      if (this.panels.size === 0 && this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = undefined;
      }
    });

    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => void this.pollAll(), POLL_INTERVAL_MS);
    }

    await this.loadAndRender(id, panel);
  }

  private async pollAll(): Promise<void> {
    await Promise.all([...this.panels.entries()].map(([id, panel]) => this.loadAndRender(id, panel)));
  }

  private async loadAndRender(id: number, panel: vscode.WebviewPanel): Promise<void> {
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    let workItem: WorkItem | undefined;
    try {
      [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    } catch {
      return; // Transient failure — skip this refresh, retry next poll.
    }
    if (!workItem) {
      return;
    }

    let layout = this.layoutCache.get(id);
    if (layout === undefined) {
      try {
        layout = await this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type);
      } catch {
        layout = null;
      }
      this.layoutCache.set(id, layout);
    }

    let rawFields: Record<string, unknown>;
    let comments: WorkItemComment[];
    let parentResult: WorkItem[];
    let children: WorkItem[];
    try {
      [rawFields, comments, parentResult, children] = await Promise.all([
        this.client.getWorkItemRawFields(config.organization, config.project, id),
        this.client.getComments(config.organization, config.project, id).catch(() => []),
        workItem.parentId ? this.client.getWorkItems(config.organization, config.project, [workItem.parentId]) : Promise.resolve([]),
        this.client.getChildren(config.organization, config.project, workItem),
      ]);
    } catch {
      return; // Transient failure — skip this refresh, retry next poll.
    }
    const parent = parentResult[0] ?? null;

    const [avatars, prDetails] = await Promise.all([
      this.resolveAvatars(workItem, comments),
      this.resolvePullRequestDetails(workItem, config),
    ]);

    const stateKey = JSON.stringify({ workItem, rawFields, comments, parent, children, avatars, prDetails });
    if (this.lastStateByPanel.get(id) === stateKey) {
      return;
    }
    this.lastStateByPanel.set(id, stateKey);

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    panel.title = `#${workItem.id} ${workItem.title}`;
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
  <style>${detailPanelCss()}</style>
</head>
<body>
  ${body}
</body>
</html>`;
  }
}
