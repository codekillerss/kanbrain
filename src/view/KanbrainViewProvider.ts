import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItem } from '../types';
import { readConfig } from '../config/config';
import { render } from './render';
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
    private readonly workspaceRoot: string,
    private readonly client: AzureDevOpsClient,
    private readonly getCurrentBranch: () => Promise<string>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'select-work-item') {
        await vscode.commands.executeCommand('kanbrain.selectWorkItem');
      } else if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
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
    this.lastState = '';
    void this.refresh();
  }

  private async runSkill(id: number): Promise<void> {
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return;
    }

    const skillPath = config.statusSkills[workItem.status];
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
    const config = readConfig(this.workspaceRoot);

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.activeWorkItemId) {
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

    if (!hasStateChanged(this.lastState, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(workItem, subtasks);
    this.view.webview.html = this.wrapHtml(render({ config, workItem, parent, subtasks }));
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
      if (target.id === 'kb-select-btn') {
        vscode.postMessage({ type: 'select-work-item' });
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      }
    });
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
    `;
  }
}
