import * as vscode from 'vscode';
import type { WorkItem } from '../types';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemComment } from '../azureDevOps/workItemDetail';
import { resolveDetailFields } from '../azureDevOps/workItemDetail';
import { readConfig } from '../config/config';
import { renderWorkItemDetail } from './renderWorkItemDetail';

export class WorkItemDetailPanelManager {
  private panels = new Map<number, vscode.WebviewPanel>();
  private avatarCache = new Map<string, string | null>();

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

    const [layout, rawFields, comments] = await Promise.all([
      this.client.getWorkItemTypeLayout(config.organization, config.project, workItem.type),
      this.client.getWorkItemRawFields(config.organization, config.project, id),
      this.client.getComments(config.organization, config.project, id).catch(() => []),
    ]);

    const { groups, htmlSections } = resolveDetailFields(layout, rawFields);
    const avatars = await this.resolveAvatars(workItem, comments);

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
      body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px 24px; max-width: 960px; margin: 0 auto; }
      .kb-detail-header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; margin-bottom: 16px; }
      .kb-detail-header-top { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.75; }
      .kb-detail-id { font-weight: 600; }
      .kb-detail-title { font-size: 22px; margin: 6px 0; }
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
    `;
  }
}
