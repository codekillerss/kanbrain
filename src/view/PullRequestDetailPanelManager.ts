import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { PullRequestThreadComment } from '../types';
import { readConfig } from '../config/config';
import { renderPullRequestDetail } from './renderPullRequestDetail';
import { detailPanelCss } from './detailPanelCss';

const POLL_INTERVAL_MS = 5000;

export class PullRequestDetailPanelManager {
  private panels = new Map<string, vscode.WebviewPanel>();
  private lastStateByPanel = new Map<string, string>();
  private avatarCache = new Map<string, string | null>();
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private gitLensIconDataUriCache: string | null | undefined;

  constructor(
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
  ) {}

  private async resolveGitLensIcon(): Promise<string | null> {
    if (this.gitLensIconDataUriCache !== undefined) {
      return this.gitLensIconDataUriCache;
    }
    const gitlens = vscode.extensions.getExtension('eamodio.gitlens');
    if (!gitlens) {
      this.gitLensIconDataUriCache = null;
      return null;
    }
    try {
      const iconPath = path.join(gitlens.extensionPath, 'images', 'gitlens-icon.png');
      const bytes = await fs.promises.readFile(iconPath);
      this.gitLensIconDataUriCache = `data:image/png;base64,${bytes.toString('base64')}`;
    } catch {
      this.gitLensIconDataUriCache = null;
    }
    return this.gitLensIconDataUriCache;
  }

  async open(repositoryId: string, pullRequestId: number): Promise<void> {
    const key = `${repositoryId}:${pullRequestId}`;
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return;
    }

    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const panel = vscode.window.createWebviewPanel('kanbrain.pullRequestDetail', `PR #${pullRequestId}`, vscode.ViewColumn.Active, {
      enableScripts: false,
      enableCommandUris: [
        'kanbrain.openWorkItemDetail',
        'kanbrain.openPullRequestDetail',
        'kanbrain.pickWorkItem',
        'kanbrain.checkoutBranch',
        'kanbrain.viewPullRequestDiff',
        'workbench.extensions.search',
      ],
    });
    this.panels.set(key, panel);

    panel.onDidDispose(() => {
      this.panels.delete(key);
      this.lastStateByPanel.delete(key);
      if (this.panels.size === 0 && this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = undefined;
      }
    });

    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => void this.pollAll(), POLL_INTERVAL_MS);
    }

    await this.loadAndRender(repositoryId, pullRequestId, panel);
  }

  private async pollAll(): Promise<void> {
    await Promise.all(
      [...this.panels.keys()].map(key => {
        const [repositoryId, pullRequestId] = key.split(':');
        const panel = this.panels.get(key)!;
        return this.loadAndRender(repositoryId, Number(pullRequestId), panel);
      }),
    );
  }

  private async loadAndRender(repositoryId: string, pullRequestId: number, panel: vscode.WebviewPanel): Promise<void> {
    const key = `${repositoryId}:${pullRequestId}`;
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const pr = await this.client.getPullRequestDetail(config.organization, config.project, repositoryId, pullRequestId);
    if (!pr) {
      return; // Transient failure or PR not found — skip this refresh, retry next poll.
    }

    // A linked work item may live in a different project than the one configured here (or have
    // become inaccessible) — don't let that take down the whole PR panel, just show none.
    const workItems = pr.workItemIds.length
      ? await this.client.getWorkItems(config.organization, config.project, pr.workItemIds).catch(() => [])
      : [];
    const threads = await this.client
      .getPullRequestThreads(config.organization, config.project, repositoryId, pullRequestId)
      .catch(() => []);
    const avatars = await this.resolveAvatars(threads.flatMap(t => t.comments));
    const gitLensIconDataUri = await this.resolveGitLensIcon();

    const stateKey = JSON.stringify({ pr, workItems, threads, avatars, gitLensIconDataUri });
    if (this.lastStateByPanel.get(key) === stateKey) {
      return;
    }
    this.lastStateByPanel.set(key, stateKey);

    panel.title = `PR #${pr.id} ${pr.title}`;
    panel.webview.html = this.wrapHtml(renderPullRequestDetail({ pr, workItems, config, threads, avatars, gitLensIconDataUri }));
  }

  private async resolveAvatars(comments: PullRequestThreadComment[]): Promise<Record<string, string>> {
    const urls = [...new Set(comments.map(c => c.createdBy.imageUrl).filter((u): u is string => !!u))];
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
