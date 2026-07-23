import * as vscode from 'vscode';
import * as path from 'node:path';
import { AzureDevOpsHttpError, type AzureDevOpsClient } from '../azureDevOps/client';
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
import { validateProjectAccess } from '../azureDevOps/validateProjectAccess';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;
  private selectedTeam: string | undefined;
  private typeCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private currentScreen: 'home' | 'flow' | 'config' = 'home';
  private connectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';
  private avatarCache = new Map<string, string | null>();

  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number | undefined) => void,
    private readonly checkAzureSession: () => Promise<boolean>,
    private readonly openWorkItemDetail: (id: number) => Promise<void>,
    private readonly persistSelectedTeam: (team: string | undefined) => void,
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
        this.notifyCommandFinished();
      } else if (message.type === 'run-connect') {
        await vscode.commands.executeCommand('kanbrain.connect');
        this.notifyCommandFinished();
      } else if (message.type === 'run-check-board-config') {
        await vscode.commands.executeCommand('kanbrain.checkBoardConfig');
        this.notifyCommandFinished();
      } else if (message.type === 'run-sync-board-config') {
        await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
        this.notifyCommandFinished();
      } else if (message.type === 'run-configure-with-ai') {
        await vscode.commands.executeCommand('kanbrain.configureWithAi');
        this.notifyCommandFinished();
      } else if (message.type === 'show-home') {
        this.showHomeScreen();
      } else if (message.type === 'show-flow') {
        this.showFlowScreen();
      } else if (message.type === 'show-config') {
        this.showConfigScreen();
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
      } else if (message.type === 'set-show-assigned-to') {
        this.setShowAssignedTo(Boolean(message.value));
      } else if (message.type === 'set-selected-team') {
        this.setSelectedTeam(message.team || undefined);
      } else if (message.type === 'open-work-item-detail') {
        await this.openWorkItemDetail(Number(message.id));
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

  private notifyCommandFinished(): void {
    this.view?.webview.postMessage({ type: 'command-finished' });
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
    this.currentScreen = id === undefined ? 'home' : 'flow';
    this.lastState = '';
    void this.refresh();
  }

  setSelectedTeam(team: string | undefined): void {
    this.selectedTeam = team;
    this.persistSelectedTeam(team);
    this.lastState = '';
    void this.refresh();
  }

  showHomeScreen(): void {
    this.currentScreen = 'home';
    this.lastState = '';
    void this.refresh();
  }

  showFlowScreen(): void {
    this.currentScreen = 'flow';
    this.lastState = '';
    void this.refresh();
  }

  showConfigScreen(): void {
    this.currentScreen = 'config';
    this.lastState = '';
    void this.refresh();
  }

  markConnected(): void {
    this.connectionStatus = 'connected';
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
        this.typeCounts = await this.fetchTypeCounts(this.client, config);
      }
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      const filtered = filterSearchResults(items, query);
      const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(filtered) : {};
      html = renderSearchResults(filtered, config, this.typeCounts, avatars);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }

  private async fetchTypeCounts(client: AzureDevOpsClient, config: KanbrainConfig): Promise<Record<string, number>> {
    const types = Object.keys(config.skills);
    const entries = await Promise.all(
      types.map(async type => [type, await client.countWorkItemsByType(config.organization, config.project, [type])] as const),
    );
    return Object.fromEntries(entries);
  }

  private async resolveAvatars(items: WorkItem[]): Promise<Record<string, string>> {
    const urls = [...new Set(items.map(i => i.assignedTo?.imageUrl).filter((u): u is string => !!u))];
    const uncached = urls.filter(u => !this.avatarCache.has(u));
    await Promise.all(
      uncached.map(async url => {
        this.avatarCache.set(url, this.client ? await this.client.getAvatarDataUri(url) : null);
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

  private setShowAssignedTo(value: boolean): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    config.showAssignedTo = value;
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private saveSkillEntry(level: string, status: string, filePath: string, label: string, textColor: string, buttonColor: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config || !config.skills[level] || !(status in config.skills[level])) {
      return;
    }

    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      config.skills[level][status] = null;
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
      config.skills[level][status] = entry;
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

  private async checkConnection(config: KanbrainConfig): Promise<'connected' | 'disconnected' | 'unknown'> {
    if (!this.client) {
      return 'disconnected';
    }
    const hasSession = await this.checkAzureSession();
    if (!hasSession) {
      return 'disconnected';
    }
    try {
      const hasAccess = await validateProjectAccess(this.client, config.organization, config.project);
      return hasAccess ? 'connected' : 'disconnected';
    } catch {
      // Transient failure (network, 5xx, timeout) — stay 'unknown' so the next poll retries the check.
      return 'unknown';
    }
  }

  private renderDisconnected(config: KanbrainConfig): void {
    if (!this.view || this.lastState === 'disconnected') {
      return;
    }
    this.lastState = 'disconnected';
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem: null,
        parent: null,
        subtasks: [],
        screen: this.currentScreen,
        connectionStatus: 'disconnected',
      }),
    );
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = this.workspaceRoot ? readConfig(this.workspaceRoot) : null;

    if (config && this.connectionStatus === 'unknown') {
      this.connectionStatus = await this.checkConnection(config);
    }

    if (config && this.connectionStatus === 'disconnected') {
      this.renderDisconnected(config);
      return;
    }

    const activeWorkItemIdAtStart = this.activeWorkItemId;

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.client && activeWorkItemIdAtStart) {
      try {
        const [fetched] = await this.client.getWorkItems(config.organization, config.project, [activeWorkItemIdAtStart]);
        workItem = fetched ?? null;
        if (workItem) {
          subtasks = await this.client.getChildren(config.organization, config.project, workItem);
          if (workItem.parentId) {
            const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
            parent = fetchedParent ?? null;
          }
        }
      } catch (error) {
        if (error instanceof AzureDevOpsHttpError && (error.status === 401 || error.status === 403)) {
          // The session actually expired/was revoked — show the Connect screen.
          this.connectionStatus = 'disconnected';
          this.renderDisconnected(config);
          return;
        }
        // Transient failure (network, 5xx, timeout) — skip this poll, keep the current
        // connection state, and retry on the next one instead of forcing a reconnect.
        return;
      }
    }

    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    // Whether the assignee actually renders is decided per work item type by resolveShowAssignedTo
    // (mirrored from the real board), so avatars are always resolved here rather than gated by the
    // (now search-only) manual showAssignedTo toggle.
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};

    if (!hasStateChanged(this.lastState, config, workItem, subtasks, avatars)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks, avatars);
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedTeam: this.selectedTeam,
      }),
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

    function setLoading(btn) {
      btn.classList.add('kb-loading');
      btn.disabled = true;
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

    document.querySelectorAll('.kb-color-picker').forEach((picker) => {
      picker.addEventListener('input', () => {
        const row = picker.closest('.kb-config-row');
        if (!row) return;
        const textInput = row.querySelector('[data-field="' + picker.dataset.colorFor + '"]');
        if (textInput) {
          textInput.value = picker.value.replace(/^#/, '');
        }
        saveSkillRow(row);
      });
    });

    const showAssigneeToggle = document.getElementById('kb-show-assignee-toggle');
    if (showAssigneeToggle) {
      showAssigneeToggle.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-show-assigned-to', value: showAssigneeToggle.checked });
      });
    }

    const teamSelect = document.getElementById('kb-team-select');
    if (teamSelect) {
      teamSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-team', team: teamSelect.value });
      });
    }

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
        setLoading(target);
        vscode.postMessage({ type: 'run-setup' });
      } else if (target.id === 'kb-run-connect-btn') {
        setLoading(target);
        vscode.postMessage({ type: 'run-connect' });
      } else if (target.id === 'kb-run-check-board-config-btn') {
        setLoading(target);
        vscode.postMessage({ type: 'run-check-board-config' });
      } else if (target.id === 'kb-run-sync-board-config-btn') {
        setLoading(target);
        vscode.postMessage({ type: 'run-sync-board-config' });
      } else if (target.id === 'kb-run-configure-ai-btn') {
        setLoading(target);
        vscode.postMessage({ type: 'run-configure-with-ai' });
      } else if (target.id === 'kb-home-btn') {
        vscode.postMessage({ type: 'show-home' });
      } else if (target.id === 'kb-open-flow-btn') {
        vscode.postMessage({ type: 'show-flow' });
      } else if (target.id === 'kb-show-config-btn') {
        vscode.postMessage({ type: 'show-config' });
      } else if (target.id === 'kb-search-close-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          section.classList.add('kb-hidden');
        }
      } else if (target.id === 'kb-search-section' && target.classList.contains('kb-search-overlay')) {
        target.classList.add('kb-hidden');
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      } else if (target.closest && target.closest('[data-action="pick-work-item"]')) {
        vscode.postMessage({ type: 'pick-work-item', id: target.closest('[data-action="pick-work-item"]').dataset.id });
      } else if (target.dataset && target.dataset.action === 'open-work-item-detail') {
        vscode.postMessage({ type: 'open-work-item-detail', id: target.dataset.id });
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
        const toggle = target.closest('[data-action="toggle-group"]');
        const items = toggle.nextElementSibling;
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
      } else if (event.data.type === 'command-finished') {
        document.querySelectorAll('.kb-loading').forEach((btn) => {
          btn.classList.remove('kb-loading');
          btn.disabled = false;
        });
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
      .kb-main-card, .kb-subtask-card { position: relative; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
      .kb-pick-btn { position: absolute; top: 4px; right: 4px; }
      .kb-team-card { margin: 10px; }
      .kb-team-card select { box-sizing: border-box; width: 100%; padding: 4px 6px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; font-family: var(--vscode-font-family); }
      .kb-card-header { display: flex; align-items: center; }
      .kb-type-icon { display: inline-flex; width: 14px; height: 14px; margin-right: 6px; flex-shrink: 0; }
      .kb-type-icon svg { width: 100%; height: 100%; }
      .kb-status-row { display: flex; align-items: center; margin-top: 4px; font-size: 12px; opacity: 0.85; }
      .kb-title { font-weight: 600; margin: 4px 0; }
      .kb-title-clickable { cursor: pointer; }
      .kb-title-clickable:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
      .kb-action-btn { margin-top: 6px; padding: 4px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-action-btn:hover { background: var(--vscode-button-hoverBackground); }
      .kb-empty { opacity: 0.7; padding: 12px 0; }
      .kb-section-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 18px 0 8px; padding: 6px 10px; font-size: 13px; font-weight: 600; color: var(--vscode-foreground); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-list-hoverBackground)); border-radius: 3px; }
      .kb-section-actions { display: flex; gap: 2px; }
      .kb-hidden { display: none; }
      .kb-result-item { width: 100%; margin: 2px 0; }
      .kb-result-item-footer { display: flex; align-items: center; margin-top: 2px; padding: 0 6px; }
      .kb-view-details-link { margin-left: auto; background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 11px; padding: 2px 4px; }
      .kb-view-details-link:hover { text-decoration: underline; }
      #kb-search-input { box-sizing: border-box; width: 100%; flex: 1; padding: 4px 6px; margin-bottom: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-header { display: flex; gap: 6px; margin-bottom: 6px; }
      .kb-page-header { position: sticky; top: 0; z-index: 10; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
      .kb-secondary-btn { box-sizing: border-box; padding: 8px 12px; text-align: center; font-size: 12px; font-weight: 500; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 4px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-secondary-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
      .kb-header .kb-secondary-btn { flex: 1; }
      .kb-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
      .kb-result-group { margin-bottom: 4px; }
      .kb-group-toggle { display: flex; align-items: center; width: 100%; text-align: left; background: transparent; border: none; border-radius: 0; padding: 0; margin: 12px 0 0; font-size: 11px; font-weight: 400; text-transform: uppercase; opacity: 0.7; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); appearance: none; -webkit-appearance: none; }
      .kb-search-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-start; justify-content: center; padding: 24px 12px; z-index: 100; }
      .kb-search-overlay.kb-hidden { display: none; }
      .kb-search-dialog { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; width: 100%; max-width: 320px; max-height: 100%; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); }
      .kb-search-dialog-header { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      #kb-search-results { overflow-y: auto; flex: 1; min-height: 0; }
      #kb-search-close-btn { flex-shrink: 0; background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 4px 6px; border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-close-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
      .kb-search-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 6px; }
      .kb-search-tab { flex-shrink: 0; padding: 4px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-search-tab:hover { background: var(--vscode-list-hoverBackground); }
      .kb-search-tab-active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: 600; }
      .kb-search-tab-empty { opacity: 0.5; }
      .kb-section-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 16px; overflow: hidden; background: var(--vscode-editor-background); }
      .kb-section-card .kb-section-label { margin: 0; border-radius: 0; }
      .kb-section-card .kb-home-commands, .kb-section-card .kb-card-wrapper, .kb-section-card .kb-checkbox-row, .kb-section-card .kb-empty { margin: 10px; }
      .kb-section-card .kb-main-card { border: none; margin: 0; }
      .kb-section-card .kb-subtask-card { margin: 8px 10px; }
      .kb-home-commands { display: flex; flex-direction: column; gap: 6px; }
      .kb-card-wrapper { position: relative; }
      .kb-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 2px; }
      .kb-icon-btn { width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; border-radius: 2px; font-size: 13px; }
      .kb-icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
      .kb-input { box-sizing: border-box; width: 100%; padding: 4px 6px; margin-bottom: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-config-parent-section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-top: 8px; background: var(--vscode-sideBarSectionHeader-background, transparent); }
      .kb-config-parent-header { font-size: 13px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 8px; }
      .kb-config-level { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 6px 0; }
      .kb-config-level-header { display: flex; align-items: center; width: 100%; text-align: left; padding: 6px 8px; background: var(--vscode-editor-background); border: none; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; font-weight: 600; }
      .kb-config-level-header:hover { background: var(--vscode-list-hoverBackground); }
      .kb-config-level-body { padding: 6px 8px; }
      .kb-chevron { display: inline-block; margin-right: 6px; transition: transform 0.15s ease; }
      .kb-config-level-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
      .kb-config-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }
      .kb-config-row-status { display: flex; align-items: center; font-weight: 600; margin-bottom: 4px; font-size: 12px; }
      .kb-config-field-path { display: flex; gap: 4px; align-items: center; }
      .kb-config-field-path .kb-input { flex: 1; margin-bottom: 0; }
      .kb-config-field-path button { flex-shrink: 0; padding: 4px 8px; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-config-field-path button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
      .kb-config-field-color { display: flex; gap: 4px; align-items: center; }
      .kb-config-field-color .kb-input { flex: 1; margin-bottom: 0; }
      .kb-color-picker { flex-shrink: 0; width: 28px; height: 26px; padding: 2px; border: 1px solid var(--vscode-panel-border); border-radius: 2px; background: transparent; cursor: pointer; }
      .kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; }
      .kb-field-row { margin-top: 6px; }
      .kb-field-label { font-size: 11px; opacity: 0.7; }
      .kb-parent-link { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
      .kb-parent-link .kb-link-text { color: var(--vscode-textLink-foreground); text-decoration: underline; }
      .kb-parent-link:hover .kb-link-text { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
      .kb-avatar { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
      .kb-avatar-initial { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 9px; flex-shrink: 0; }
      .kb-result-item-main { display: flex; align-items: center; width: 100%; text-align: left; padding: 4px 6px; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); min-width: 0; }
      .kb-result-item-main:hover { background: var(--vscode-list-hoverBackground); }
      .kb-result-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
      .kb-result-item-assignee { display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: 0.75; }
      .kb-result-item-assignee .kb-avatar, .kb-result-item-assignee .kb-avatar-initial { width: 14px; height: 14px; }
      .kb-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 6px 0; cursor: pointer; }
      .kb-dev-badge { display: flex; align-items: center; gap: 4px; font-size: 12px; }
      .kb-dev-badge svg { flex-shrink: 0; }
      .kb-loading { opacity: 0.6; cursor: default; }
      .kb-loading::after { content: ''; display: inline-block; width: 10px; height: 10px; margin-left: 6px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; vertical-align: middle; animation: kb-spin 0.6s linear infinite; }
      @keyframes kb-spin { to { transform: rotate(360deg); } }
    `;
  }
}
