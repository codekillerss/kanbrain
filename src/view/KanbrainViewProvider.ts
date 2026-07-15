import * as vscode from 'vscode';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItem, KanbrainConfig, SkillEntry } from '../types';
import { readConfig, writeConfig } from '../config/config';
import { resolveSkill } from '../config/resolveSkill';
import { render } from './render';
import { renderSearchResults } from './renderSearchResults';
import { filterSearchResults } from './filterSearchResults';
import { escapeHtml } from './escapeHtml';
import { serializeState, hasStateChanged } from './hasStateChanged';
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';
import { presentBoardConfigCheck } from '../commands/checkBoardConfig';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private showHome = true;

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
      } else if (message.type === 'run-setup') {
        await vscode.commands.executeCommand('kanbrain.setup');
      } else if (message.type === 'run-check-board-config') {
        await vscode.commands.executeCommand('kanbrain.checkBoardConfig');
      } else if (message.type === 'run-sync-board-config') {
        await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
      } else if (message.type === 'show-home') {
        this.showHomeScreen();
      } else if (message.type === 'show-focused') {
        this.showFocusedScreen();
      } else if (message.type === 'save-skill-entry') {
        this.saveSkillEntry(
          String(message.level ?? ''),
          String(message.status ?? ''),
          String(message.path ?? ''),
          String(message.label ?? ''),
          String(message.textColor ?? ''),
          String(message.buttonColor ?? ''),
        );
      } else if (message.type === 'pick-skill-file') {
        await this.pickSkillFile(String(message.level ?? ''), String(message.status ?? ''));
      }
    });

    void this.refresh();
    this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    webviewView.onDidDispose(() => {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
      }
    });
    void this.runInitialBoardConfigCheck();
  }

  private async runInitialBoardConfigCheck(): Promise<void> {
    if (this.hasCheckedBoardConfig || !this.workspaceRoot || !this.client) {
      return;
    }
    this.hasCheckedBoardConfig = true;
    await presentBoardConfigCheck(this.client, this.workspaceRoot, { quietWhenNothingToReport: true });
  }

  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.persistActiveWorkItem(id);
    this.showHome = id === undefined;
    this.lastState = '';
    void this.refresh();
  }

  showHomeScreen(): void {
    this.showHome = true;
    this.lastState = '';
    void this.refresh();
  }

  showFocusedScreen(): void {
    this.showHome = false;
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
      if (query.trim() === '') {
        this.backlogLevelCounts = await this.fetchBacklogLevelCounts(this.client, config);
      }
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      html = renderSearchResults(filterSearchResults(items, query), config, this.backlogLevelCounts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }

  private async fetchBacklogLevelCounts(client: AzureDevOpsClient, config: KanbrainConfig): Promise<Record<string, number>> {
    const levels = Object.keys(config.backlogLevels);
    const entries = await Promise.all(
      levels.map(async level => {
        const types = Object.entries(config.typeToBacklogLevel)
          .filter(([, backlogLevel]) => backlogLevel === level)
          .map(([type]) => type);
        const count = await client.countWorkItemsByType(config.organization, config.project, types);
        return [level, count] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private saveSkillEntry(level: string, status: string, filePath: string, label: string, textColor: string, buttonColor: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config || !config.backlogLevels[level] || !(status in config.backlogLevels[level])) {
      return;
    }

    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      config.backlogLevels[level][status] = null;
    } else {
      const entry: SkillEntry = { path: trimmedPath };
      if (label.trim()) {
        entry.label = label.trim();
      }
      if (textColor.trim()) {
        entry.textColor = textColor.trim();
      }
      if (buttonColor.trim()) {
        entry.buttonColor = buttonColor.trim();
      }
      config.backlogLevels[level][status] = entry;
    }

    writeConfig(this.workspaceRoot, config);
  }

  private async pickSkillFile(level: string, status: string): Promise<void> {
    if (!this.workspaceRoot || !this.view) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(this.workspaceRoot),
      canSelectMany: false,
      filters: { Markdown: ['md'] },
    });
    const picked = uris?.[0];
    if (!picked) {
      return;
    }
    const relativePath = path.relative(this.workspaceRoot, picked.fsPath).split(path.sep).join('/');
    this.view.webview.postMessage({ type: 'skill-file-picked', level, status, path: relativePath });
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

    const skill = resolveSkill(config, workItem);
    if (!skill) {
      return;
    }

    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skill.path, {
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
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, showHome: this.showHome }),
    );
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head><style>${this.css()}</style></head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    let activeSearchTab = 'all';

    function applySearchTab() {
      document.querySelectorAll('.kb-search-tab').forEach((btn) => {
        btn.classList.toggle('kb-search-tab-active', btn.dataset.tab === activeSearchTab);
      });
      document.querySelectorAll('.kb-search-tab-panel').forEach((panel) => {
        panel.classList.toggle('kb-hidden', panel.dataset.tabPanel !== activeSearchTab);
      });
    }

    function saveSkillRow(row) {
      vscode.postMessage({
        type: 'save-skill-entry',
        level: row.dataset.level,
        status: row.dataset.status,
        path: row.querySelector('[data-field="path"]').value,
        label: row.querySelector('[data-field="label"]').value,
        textColor: row.querySelector('[data-field="textColor"]').value,
        buttonColor: row.querySelector('[data-field="buttonColor"]').value,
      });
    }

    document.querySelectorAll('.kb-config-row input').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-config-row');
        if (row) {
          saveSkillRow(row);
        }
      });
    });

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
      } else if (target.id === 'kb-run-setup-btn' || target.id === 'kb-run-setup-home-btn') {
        vscode.postMessage({ type: 'run-setup' });
      } else if (target.id === 'kb-run-check-board-config-btn') {
        vscode.postMessage({ type: 'run-check-board-config' });
      } else if (target.id === 'kb-run-sync-board-config-btn') {
        vscode.postMessage({ type: 'run-sync-board-config' });
      } else if (target.id === 'kb-home-btn') {
        vscode.postMessage({ type: 'show-home' });
      } else if (target.id === 'kb-view-details-btn') {
        vscode.postMessage({ type: 'show-focused' });
      } else if (target.id === 'kb-search-close-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          section.classList.add('kb-hidden');
        }
      } else if (target.id === 'kb-search-section' && target.classList.contains('kb-search-overlay')) {
        target.classList.add('kb-hidden');
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'toggle-group') {
        const items = target.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
        activeSearchTab = target.dataset.tab;
        applySearchTab();
      } else if (target.dataset && target.dataset.action === 'pick-skill-file') {
        const row = target.closest('.kb-config-row');
        if (row) {
          vscode.postMessage({ type: 'pick-skill-file', level: row.dataset.level, status: row.dataset.status });
        }
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
          applySearchTab();
        }
      } else if (event.data.type === 'skill-file-picked') {
        const rows = document.querySelectorAll('.kb-config-row');
        for (const row of rows) {
          if (row.dataset.level === event.data.level && row.dataset.status === event.data.status) {
            const pathInput = row.querySelector('[data-field="path"]');
            pathInput.value = event.data.path;
            saveSkillRow(row);
            break;
          }
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
      .kb-main-card, .kb-subtask-card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
      .kb-card-header { display: flex; align-items: center; }
      .kb-type-icon { display: inline-flex; width: 14px; height: 14px; margin-right: 6px; flex-shrink: 0; }
      .kb-type-icon svg { width: 100%; height: 100%; }
      .kb-status-row { display: flex; align-items: center; margin-top: 4px; font-size: 12px; opacity: 0.85; }
      .kb-title { font-weight: 600; margin: 4px 0; }
      .kb-action-btn { margin-top: 6px; padding: 4px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-action-btn:hover { background: var(--vscode-button-hoverBackground); }
      .kb-empty { opacity: 0.7; padding: 12px 0; }
      .kb-section-label { margin-top: 12px; font-size: 11px; text-transform: uppercase; opacity: 0.7; }
      .kb-hidden { display: none; }
      .kb-result-item { display: flex; align-items: center; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-result-item:hover { background: var(--vscode-list-hoverBackground); }
      #kb-search-input { box-sizing: border-box; width: 100%; flex: 1; padding: 4px 6px; margin-bottom: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-header { display: flex; gap: 6px; margin-bottom: 6px; }
      #kb-toggle-search-btn, #kb-clear-btn, #kb-home-btn { flex: 1; box-sizing: border-box; padding: 4px 6px; text-align: center; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      #kb-toggle-search-btn:hover, #kb-clear-btn:hover, #kb-home-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
      .kb-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
      .kb-result-group { margin-bottom: 4px; }
      .kb-group-toggle { display: flex; align-items: center; width: 100%; text-align: left; background: transparent; border: none; padding: 0; margin-top: 12px; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); appearance: none; -webkit-appearance: none; }
      .kb-search-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-start; justify-content: center; padding: 24px 12px; z-index: 100; }
      .kb-search-overlay.kb-hidden { display: none; }
      .kb-search-dialog { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; width: 100%; max-width: 320px; max-height: 100%; overflow-y: auto; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); }
      .kb-search-dialog-header { display: flex; align-items: center; gap: 6px; }
      #kb-search-close-btn { flex-shrink: 0; background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 4px 6px; border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-close-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
      .kb-search-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 6px; }
      .kb-search-tab { flex-shrink: 0; padding: 4px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-search-tab:hover { background: var(--vscode-list-hoverBackground); }
      .kb-search-tab-active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: 600; }
      .kb-search-tab-empty { opacity: 0.5; }
      .kb-home-section { margin-bottom: 16px; }
      .kb-home-commands { display: flex; flex-direction: column; gap: 4px; }
      .kb-input { box-sizing: border-box; width: 100%; padding: 4px 6px; margin-bottom: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-config-level { margin-bottom: 8px; }
      .kb-config-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }
      .kb-config-row-status { display: flex; align-items: center; font-weight: 600; margin-bottom: 4px; font-size: 12px; }
      .kb-config-field-path { display: flex; gap: 4px; align-items: center; }
      .kb-config-field-path .kb-input { flex: 1; margin-bottom: 0; }
      .kb-config-field-path button { flex-shrink: 0; padding: 4px 8px; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-config-field-path button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
    `;
  }
}
