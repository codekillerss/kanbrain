import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItem } from '../types';
import { readConfig } from '../config/config';
import { resolveSkillPath } from '../config/resolveSkillPath';
import { render } from './render';
import { renderSearchResults } from './renderSearchResults';
import { escapeHtml } from './escapeHtml';
import { serializeState, hasStateChanged } from './hasStateChanged';
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;

  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number | undefined) => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''));
      } else if (message.type === 'pick-work-item') {
        this.setActiveWorkItem(Number(message.id));
      } else if (message.type === 'clear-work-item') {
        this.setActiveWorkItem(undefined);
      }
    });

    void this.refresh();
    this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    webviewView.onDidDispose(() => {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
      }
    });
  }

  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.persistActiveWorkItem(id);
    this.lastState = '';
    void this.refresh();
  }

  private async searchWorkItems(query: string): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    let html: string;
    try {
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      html = renderSearchResults(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }

  private async runSkill(id: number): Promise<void> {
    if (!this.workspaceRoot || !this.client) {
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

    const skillPath = resolveSkillPath(config, workItem);
    if (!skillPath) {
      return;
    }

    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skillPath, {
      workItem,
      parent: parent ?? null,
      subtasks,
      branch,
    });

    sendReadCommand(relativePath);
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = this.workspaceRoot ? readConfig(this.workspaceRoot) : null;

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.client && this.activeWorkItemId) {
      const [fetched] = await this.client.getWorkItems(config.organization, config.project, [this.activeWorkItemId]);
      workItem = fetched ?? null;
      if (workItem) {
        subtasks = await this.client.getChildren(config.organization, config.project, workItem);
        if (workItem.parentId) {
          const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
          parent = fetchedParent ?? null;
        }
      }
    }

    if (!hasStateChanged(this.lastState, config, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks);
    this.view.webview.html = this.wrapHtml(render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks }));
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head><style>${this.css()}</style></head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'kb-toggle-search-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          const wasHidden = section.classList.contains('kb-hidden');
          section.classList.toggle('kb-hidden');
          if (wasHidden) {
            vscode.postMessage({ type: 'search-work-items', query: '' });
          }
        }
      } else if (target.id === 'kb-clear-btn') {
        vscode.postMessage({ type: 'clear-work-item' });
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      }
    });

    const searchInput = document.getElementById('kb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        vscode.postMessage({ type: 'search-work-items', query: e.target.value });
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'search-results') {
        const results = document.getElementById('kb-search-results');
        if (results) {
          results.innerHTML = event.data.html;
        }
      }
    });

    const searchSection = document.getElementById('kb-search-section');
    if (searchSection && !searchSection.classList.contains('kb-hidden')) {
      vscode.postMessage({ type: 'search-work-items', query: '' });
    }
  </script>
</body>
</html>`;
  }

  private css(): string {
    return `
      body { font-family: var(--vscode-font-family); padding: 8px; }
      .kb-badge { border-radius: 4px; padding: 2px 6px; margin-right: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; }
      .kb-main-card, .kb-subtask-card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
      .kb-title { font-weight: 600; margin: 4px 0; }
      .kb-action-btn { margin-top: 6px; }
      .kb-empty { opacity: 0.7; padding: 12px 0; }
      .kb-section-label { margin-top: 12px; font-size: 11px; text-transform: uppercase; opacity: 0.7; }
      .kb-hidden { display: none; }
      .kb-result-item { display: block; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-result-item:hover { background: var(--vscode-list-hoverBackground); }
      #kb-search-input { box-sizing: border-box; width: 100%; padding: 4px 6px; margin-bottom: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-header { display: flex; gap: 6px; margin-bottom: 6px; }
      #kb-toggle-search-btn, #kb-clear-btn { flex: 1; box-sizing: border-box; padding: 4px 6px; text-align: center; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      #kb-toggle-search-btn:hover, #kb-clear-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
    `;
  }
}
