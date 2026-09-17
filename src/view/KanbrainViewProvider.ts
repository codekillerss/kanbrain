import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { classifyPrThreads } from '../azureDevOps/classifyPrThreads';
import { AzureDevOpsHttpError, type AzureDevOpsClient } from '../azureDevOps/client';
import { filterOutRemoved } from '../azureDevOps/filterRemovedWorkItems';
import { validateProjectAccess } from '../azureDevOps/validateProjectAccess';
import { countItemsByType, filterByAssignedTo, filterWorkItemsByText } from '../azureDevOps/wiql';
import { presentBoardConfigCheck } from '../commands/checkBoardConfig';
import { readConfig, writeConfig } from '../config/config';
import { resolveActiveProfile } from '../config/resolveActiveProfile';
import { resolveSkill } from '../config/resolveSkill';
import { resolveWorkflowStep } from '../config/resolveWorkflowStep';
import { cloneRepository } from '../git/cloneRepository';
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommandForTab } from '../terminal/tabTerminal';
import type { KanbrainConfig, PullRequestSummary, SkillEntry, WorkflowStepConfig, WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';
import { hasStateChanged, serializeState } from './hasStateChanged';
import { render } from './render';
import { renderSavedQueryOptions } from './renderSavedQueryOptions';
import { renderSearchResults } from './renderSearchResults';
import { renderWorkItemHistory } from './renderWorkItemHistory';
import { addTab, closeTab, replaceActiveWorkItem, MAX_TABS, type WorkItemTab, type TabsUpdate } from './tabs';

const POLL_INTERVAL_MS = 5000;
const REVIEWS_POLL_INTERVAL_MS = 10000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private tabs: WorkItemTab[] = [];
  private activeTabId: string | undefined;
  private tabTypesCache = new Map<number, string>();
  private cardCache = new Map<number, { workItem: WorkItem | null; parent: WorkItem | null; subtasks: WorkItem[]; polledAt: number }>();
  private activeWorkItemId: number | undefined;
  private selectedTeam: string | undefined;
  private typeCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private currentScreen: 'home' | 'flow' | 'config' | 'brain' | 'reviews' = 'home';
  private connectionStatus: 'unknown' | 'connected' | 'disconnected' = 'unknown';
  private avatarCache = new Map<string, string | null>();
  private parentCollapsed = false;
  private childrenCollapsed = false;
  private openBrainSegment: 'repositories' | 'skills' | 'workflow' | 'profiles' | null = 'skills';
  private reviewsStatusFilters: Array<'active' | 'completed' | 'abandoned'> = ['active'];
  private reviewsOwnerFilter: 'all' | 'mine' | 'assigned' | 'fixed' | 'needsMyFix' = 'all';
  private reviewsPullRequests: PullRequestSummary[] = [];
  private reviewsFetchFailedCount = 0;
  private currentUserId: string | null | undefined;
  private lastReviewsFetchAt = 0;
  private lastReviewsFilterKeyFetched: string | undefined;
  private workItemHistoryIds: number[];
  private selectedSavedQueryId: string | undefined;

  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly extensionVersion: string,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly checkAzureSession: () => Promise<boolean>,
    private readonly openWorkItemDetail: (id: number) => Promise<void>,
    private readonly persistSelectedTeam: (team: string | undefined) => void,
    initialWorkItemHistoryIds: number[] = [],
    private readonly persistWorkItemHistory: (ids: number[]) => void = () => {},
    initialSelectedSavedQueryId: string | undefined = undefined,
    private readonly persistSelectedSavedQueryId: (id: string | undefined) => void = () => {},
    initialTabs: WorkItemTab[] = [],
    initialActiveTabId: string | undefined = undefined,
    private readonly persistTabs: (tabs: WorkItemTab[], activeTabId: string | undefined) => void = () => {},
  ) {
    this.workItemHistoryIds = initialWorkItemHistoryIds
      .filter((id, index, ids) => Number.isInteger(id) && id > 0 && ids.indexOf(id) === index)
      .slice(0, 50);
    this.selectedSavedQueryId = initialSelectedSavedQueryId;
    this.tabs = initialTabs;
    this.activeTabId = initialActiveTabId;
    this.activeWorkItemId = this.tabs.find(t => t.id === this.activeTabId)?.workItemId;
    this.currentScreen = this.activeWorkItemId !== undefined ? 'flow' : 'home';
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: ['kanbrain.openPullRequestDetail', 'kanbrain.checkoutBranch'],
    };

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      } else if (message.type === 'run-skill-by-id') {
        await this.runSkillById(Number(message.workItemId), String(message.skillId ?? ''));
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''), message.queryId ? String(message.queryId) : undefined);
      } else if (message.type === 'set-search-assigned-to-me') {
        await this.setSearchAssignedToMe(
          Boolean(message.value),
          String(message.query ?? ''),
          message.queryId ? String(message.queryId) : undefined,
        );
      } else if (message.type === 'pick-work-item') {
        this.setActiveWorkItem(Number(message.id));
      } else if (message.type === 'add-tab') {
        this.openNewTab(Number(message.id));
      } else if (message.type === 'select-tab') {
        this.selectTab(String(message.tabId ?? ''));
      } else if (message.type === 'close-tab') {
        this.closeTabById(String(message.tabId ?? ''));
      } else if (message.type === 'clear-work-item') {
        this.closeActiveTab();
      } else if (message.type === 'load-work-item-history') {
        await this.loadWorkItemHistory();
      } else if (message.type === 'load-saved-queries') {
        await this.loadSavedQueries();
      } else if (message.type === 'set-selected-saved-query') {
        this.setSelectedSavedQuery(message.queryId ? String(message.queryId) : undefined);
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
          String(message.id ?? ''),
          String(message.path ?? ''),
          String(message.label ?? ''),
          String(message.textColor ?? ''),
          String(message.buttonColor ?? ''),
          Boolean(message.isGlobal),
        );
      } else if (message.type === 'pick-skill-file') {
        await this.pickSkillFile(String(message.id ?? ''));
      } else if (message.type === 'add-skill') {
        this.addSkill();
      } else if (message.type === 'remove-skill') {
        await this.removeSkill(String(message.id ?? ''));
      } else if (message.type === 'save-workflow-step') {
        this.saveWorkflowStep(
          String(message.level ?? ''),
          String(message.status ?? ''),
          String(message.skillId ?? ''),
          String(message.definitionOfDone ?? ''),
          String(message.artifacts ?? ''),
        );
      } else if (message.type === 'add-profile') {
        this.addProfile();
      } else if (message.type === 'save-profile-entry') {
        this.saveProfileEntry(String(message.id ?? ''), String(message.label ?? ''), String(message.description ?? ''));
      } else if (message.type === 'remove-profile') {
        this.removeProfile(String(message.id ?? ''));
      } else if (message.type === 'set-show-assigned-to') {
        this.setShowAssignedTo(Boolean(message.value));
      } else if (message.type === 'set-selected-team') {
        this.setSelectedTeam(message.team || undefined);
      } else if (message.type === 'set-selected-profile') {
        this.setSelectedProfile(message.profileId || undefined);
      } else if (message.type === 'show-brain') {
        this.showBrainScreen();
      } else if (message.type === 'show-reviews') {
        this.showReviewsScreen();
      } else if (message.type === 'toggle-reviews-status-filter') {
        this.toggleReviewsStatusFilter(message.status);
      } else if (message.type === 'set-reviews-owner-filter') {
        this.setReviewsOwnerFilter(message.value);
      } else if (message.type === 'save-repository-path') {
        this.saveRepositoryPath(String(message.repositoryId ?? ''), String(message.path ?? ''));
      } else if (message.type === 'pick-repository-folder') {
        await this.pickRepositoryFolder(String(message.repositoryId ?? ''));
      } else if (message.type === 'clone-repository') {
        await this.cloneRepositoryFromView(String(message.repositoryId ?? ''));
      } else if (message.type === 'open-work-item-detail') {
        await this.openWorkItemDetail(Number(message.id));
      } else if (message.type === 'toggle-section') {
        this.toggleSection(String(message.section ?? ''));
      } else if (message.type === 'run-segment-ai') {
        await this.runSegmentAi(String(message.segment ?? ''));
      } else if (message.type === 'set-open-brain-segment') {
        this.setOpenBrainSegment(message.segment ?? null);
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

  setActiveWorkItem(id: number, recordHistory = true): void {
    this.applyTabsUpdate(replaceActiveWorkItem(this.tabs, this.activeTabId, id, randomUUID()));
    if (recordHistory) {
      this.workItemHistoryIds = [id, ...this.workItemHistoryIds.filter(historyId => historyId !== id)].slice(0, 50);
      this.persistWorkItemHistory(this.workItemHistoryIds);
    }
    this.currentScreen = 'flow';
    this.lastState = '';
    void this.refresh();
  }

  openNewTab(id: number): void {
    const update = addTab(this.tabs, id, randomUUID());
    if (!update) {
      vscode.window.showInformationMessage(`You can have up to ${MAX_TABS} work items open at once. Close a tab before opening another.`);
      return;
    }
    this.applyTabsUpdate(update);
    this.workItemHistoryIds = [id, ...this.workItemHistoryIds.filter(historyId => historyId !== id)].slice(0, 50);
    this.persistWorkItemHistory(this.workItemHistoryIds);
    this.currentScreen = 'flow';
    this.lastState = '';
    void this.refresh();
  }

  selectTab(tabId: string): void {
    if (tabId === this.activeTabId || !this.tabs.some(t => t.id === tabId)) {
      return;
    }
    this.applyTabsUpdate({ tabs: this.tabs, activeTabId: tabId });
    this.currentScreen = 'flow';
    this.lastState = '';
    void this.refresh();
  }

  closeTabById(tabId: string): void {
    this.applyTabsUpdate(closeTab(this.tabs, this.activeTabId, tabId));
    this.currentScreen = this.activeTabId === undefined ? 'home' : 'flow';
    this.lastState = '';
    void this.refresh();
  }

  closeActiveTab(): void {
    if (this.activeTabId) {
      this.closeTabById(this.activeTabId);
    }
  }

  resetAllTabs(): void {
    this.applyTabsUpdate({ tabs: [], activeTabId: undefined });
    this.currentScreen = 'home';
    this.lastState = '';
    void this.refresh();
  }

  private applyTabsUpdate(update: TabsUpdate): void {
    this.tabs = update.tabs;
    this.activeTabId = update.activeTabId;
    this.activeWorkItemId = this.tabs.find(t => t.id === this.activeTabId)?.workItemId;
    this.persistTabs(this.tabs, this.activeTabId);
  }

  private async loadWorkItemHistory(): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) return;
    const config = readConfig(this.workspaceRoot);
    if (!config) return;
    try {
      const fetched = this.workItemHistoryIds.length
        ? await this.client.getWorkItems(config.organization, config.project, this.workItemHistoryIds)
        : [];
      const byId = new Map(fetched.map(item => [item.id, item]));
      const items = this.workItemHistoryIds.map(id => byId.get(id)).filter((item): item is WorkItem => !!item);
      const avatars = await this.resolveAvatars(items);
      this.view.webview.postMessage({ type: 'work-item-history', html: renderWorkItemHistory(items, config, avatars, this.activeWorkItemId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.view.webview.postMessage({
        type: 'work-item-history',
        html: `<div class="kb-empty">Error loading history: ${escapeHtml(message)}</div>`,
      });
    }
  }

  private async loadSavedQueries(): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) return;
    const config = readConfig(this.workspaceRoot);
    if (!config) return;
    try {
      const queries = await this.client.listQueries(config.organization, config.project);
      const selected = this.selectedSavedQueryId ? queries.find(q => q.id === this.selectedSavedQueryId) : undefined;
      this.view.webview.postMessage({
        type: 'saved-queries',
        html: renderSavedQueryOptions(queries),
        selectedQueryId: selected?.id,
        selectedQueryPath: selected?.path,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.view.webview.postMessage({
        type: 'saved-queries',
        html: `<div class="kb-empty">Error loading queries: ${escapeHtml(message)}</div>`,
      });
    }
  }

  getActiveWorkItemId(): number | undefined {
    return this.activeWorkItemId;
  }

  private toggleSection(section: string): void {
    if (section === 'parent') {
      this.parentCollapsed = !this.parentCollapsed;
    } else if (section === 'children') {
      this.childrenCollapsed = !this.childrenCollapsed;
    }
  }

  private setOpenBrainSegment(segment: string | null): void {
    this.openBrainSegment =
      segment === 'repositories' || segment === 'skills' || segment === 'workflow' || segment === 'profiles' ? segment : null;
  }

  private async runSegmentAi(segment: string): Promise<void> {
    const commandBySegment: Record<string, string> = {
      repositories: 'kanbrain.configureRepositoriesWithAi',
      skills: 'kanbrain.configureSkillsWithAi',
      workflow: 'kanbrain.configureWorkflowWithAi',
      profiles: 'kanbrain.configureProfilesWithAi',
    };
    const command = commandBySegment[segment];
    if (!command) {
      return;
    }
    await vscode.commands.executeCommand(command);
    this.notifyCommandFinished();
  }

  setSelectedTeam(team: string | undefined): void {
    this.selectedTeam = team;
    this.persistSelectedTeam(team);
    this.lastState = '';
    void this.refresh();
  }

  private setSelectedProfile(profileId: string | undefined): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    config.selectedProfileId = profileId;
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private setSelectedSavedQuery(queryId: string | undefined): void {
    this.selectedSavedQueryId = queryId;
    this.persistSelectedSavedQueryId(queryId);
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

  showBrainScreen(): void {
    this.currentScreen = 'brain';
    this.lastState = '';
    void this.refresh();
  }

  showReviewsScreen(): void {
    this.currentScreen = 'reviews';
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }

  private toggleReviewsStatusFilter(status: unknown): void {
    if (status !== 'active' && status !== 'completed' && status !== 'abandoned') {
      return;
    }
    if (this.reviewsOwnerFilter === 'fixed' || this.reviewsOwnerFilter === 'needsMyFix') {
      // The status select is locked to "active" (and disabled client-side) for these owner
      // filters, since fixed/needsMyFix always fetch active PRs regardless of this setting.
      return;
    }
    const isSelected = this.reviewsStatusFilters.includes(status);
    if (isSelected && this.reviewsStatusFilters.length === 1) {
      // At least one status must always stay selected.
      return;
    }
    this.reviewsStatusFilters = isSelected ? this.reviewsStatusFilters.filter(s => s !== status) : [...this.reviewsStatusFilters, status];
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }

  private setReviewsOwnerFilter(value: unknown): void {
    if (value !== 'all' && value !== 'mine' && value !== 'assigned' && value !== 'fixed' && value !== 'needsMyFix') {
      return;
    }
    if (value === this.reviewsOwnerFilter) {
      return;
    }
    this.reviewsOwnerFilter = value;
    this.lastState = '';
    this.lastReviewsFetchAt = 0;
    void this.refresh();
  }

  markConnected(): void {
    this.connectionStatus = 'connected';
    this.lastState = '';
    void this.refresh();
  }

  private async searchWorkItems(query: string, queryId?: string): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const assignedToMe = config.searchAssignedToMe === true;

    let html: string;
    try {
      let items: WorkItem[];
      let typeCounts: Record<string, number>;
      if (queryId) {
        const ids = await this.client.runSavedQuery(config.organization, config.project, queryId);
        const queryItems = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
        typeCounts = countItemsByType(queryItems);
        items = filterWorkItemsByText(queryItems, query);
        if (assignedToMe) {
          const userId = await this.resolveCurrentUserId();
          items = userId ? filterByAssignedTo(items, userId) : [];
        }
      } else {
        if (query.trim() === '') {
          this.typeCounts = await this.fetchTypeCounts(this.client, config);
        }
        const ids = await this.client.searchWorkItems(config.organization, config.project, query, assignedToMe);
        items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
        typeCounts = this.typeCounts;
      }
      const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(items) : {};
      html = renderSearchResults(items, config, typeCounts, avatars);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }

  private async setSearchAssignedToMe(value: boolean, query: string, queryId?: string): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    config.searchAssignedToMe = value;
    writeConfig(this.workspaceRoot, config);
    await this.searchWorkItems(query, queryId);
  }

  private async resolveCurrentUserId(): Promise<string | null> {
    if (this.currentUserId === undefined) {
      this.currentUserId = this.client ? await this.client.getCurrentUserId() : null;
    }
    return this.currentUserId ?? null;
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
        this.avatarCache.set(url, this.client ? await this.client.getAuthenticatedImageDataUri(url) : null);
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

  private saveWorkflowStep(level: string, status: string, skillId: string, definitionOfDone: string, artifacts: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config || !config.workflowSteps[level] || !(status in config.workflowSteps[level])) {
      return;
    }

    const trimmedSkillId = skillId.trim();
    const parseLines = (value: string): string[] | undefined => {
      const lines = value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      return lines.length > 0 ? lines : undefined;
    };

    config.workflowSteps[level][status] = {
      skillId: trimmedSkillId || null,
      definitionOfDone: parseLines(definitionOfDone),
      artifacts: parseLines(artifacts),
    };

    writeConfig(this.workspaceRoot, config);
  }

  private addSkill(): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    const id = `skill-${Date.now()}`;
    config.skills = { ...config.skills, [id]: { path: '' } };
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private saveSkillEntry(id: string, filePath: string, label: string, textColor: string, buttonColor: string, isGlobal: boolean): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.skills?.[id]) {
      return;
    }
    const entry: SkillEntry = { path: filePath.trim() };
    if (label.trim()) {
      entry.label = label.trim();
    }
    if (textColor.trim()) {
      entry.textColor = textColor.trim();
    }
    if (buttonColor.trim()) {
      entry.buttonColor = buttonColor.trim();
    }
    if (isGlobal) {
      entry.isGlobal = true;
    }
    config.skills[id] = entry;
    writeConfig(this.workspaceRoot, config);
  }

  private async removeSkill(id: string): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    const entry = config?.skills?.[id];
    if (!entry) {
      return;
    }
    const label = entry.label || entry.path || id;
    const confirmed = await vscode.window.showWarningMessage(
      `Remove the skill "${label}"? This only removes it from the registry and any workflow steps it's wired to — the skill file itself is not deleted.`,
      { modal: true },
      'Remove',
    );
    if (confirmed !== 'Remove') {
      return;
    }
    // Re-read in case config changed while the modal was open, and bail if the skill is already gone.
    const latest = readConfig(this.workspaceRoot);
    if (!latest?.skills?.[id]) {
      return;
    }
    delete latest.skills[id];
    writeConfig(this.workspaceRoot, latest);
    this.lastState = '';
    void this.refresh();
  }

  private addProfile(): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    const id = `profile-${Date.now()}`;
    config.profiles = { ...(config.profiles ?? {}), [id]: { label: '', description: '' } };
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private saveProfileEntry(id: string, label: string, description: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.profiles?.[id]) {
      return;
    }
    config.profiles[id] = { label: label.trim(), description: description.trim() };
    writeConfig(this.workspaceRoot, config);
  }

  private removeProfile(id: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.profiles?.[id]) {
      return;
    }
    delete config.profiles[id];
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private async pickSkillFile(id: string): Promise<void> {
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
    this.view.webview.postMessage({ type: 'skill-file-picked', id, path: relativePath });
  }

  private saveRepositoryPath(repositoryId: string, newPath: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.repositories?.[repositoryId]) {
      return;
    }
    config.repositories[repositoryId].path = newPath.trim();
    writeConfig(this.workspaceRoot, config);
  }

  private async pickRepositoryFolder(repositoryId: string): Promise<void> {
    if (!this.workspaceRoot || !this.view) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(this.workspaceRoot),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    const picked = uris?.[0];
    if (!picked) {
      return;
    }
    this.view.webview.postMessage({ type: 'repository-folder-picked', repositoryId, path: picked.fsPath });
  }

  private async cloneRepositoryFromView(repositoryId: string): Promise<void> {
    if (!this.workspaceRoot || !this.view) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    const entry = config?.repositories?.[repositoryId];
    if (!config || !entry) {
      return;
    }

    const parentUris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(this.workspaceRoot),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select destination folder',
    });
    const parentDir = parentUris?.[0]?.fsPath;
    if (!parentDir) {
      return;
    }

    const cloneUrl = `https://dev.azure.com/${config.organization}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(entry.name)}`;

    try {
      const clonedPath = await cloneRepository(parentDir, cloneUrl, entry.name);
      const freshConfig = readConfig(this.workspaceRoot);
      if (freshConfig?.repositories?.[repositoryId]) {
        freshConfig.repositories[repositoryId].path = clonedPath;
        writeConfig(this.workspaceRoot, freshConfig);
      }
      vscode.window.showInformationMessage(`Cloned "${entry.name}" to ${clonedPath}.`);
      this.lastState = '';
      void this.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Clone failed: ${detail}`);
    }
  }

  private async runSkill(id: number): Promise<void> {
    const found = await this.loadWorkItemForSkill(id);
    if (!found) {
      return;
    }
    const skill = resolveSkill(found.config, found.workItem);
    if (!skill) {
      return;
    }
    const workflowStep = resolveWorkflowStep(found.config, found.workItem);
    await this.executeSkill(found.workItem, skill, workflowStep);
  }

  private async runSkillById(id: number, skillId: string): Promise<void> {
    const found = await this.loadWorkItemForSkill(id);
    if (!found) {
      return;
    }
    const skill = found.config.skills[skillId];
    if (!skill) {
      return;
    }
    await this.executeSkill(found.workItem, skill, null);
  }

  private async loadWorkItemForSkill(id: number): Promise<{ config: KanbrainConfig; workItem: WorkItem } | null> {
    if (!this.workspaceRoot || !this.client) {
      return null;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return null;
    }
    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return null;
    }
    return { config, workItem };
  }

  private async executeSkill(workItem: WorkItem, skill: SkillEntry, workflowStep: WorkflowStepConfig | null): Promise<void> {
    if (!this.workspaceRoot || !this.client || !this.activeTabId) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = filterOutRemoved(await this.client.getChildren(config.organization, config.project, workItem), config);
    const branch = await this.getCurrentBranch();

    const profile = resolveActiveProfile(config);
    const relativePath = generateContextFile(
      this.workspaceRoot,
      skill.path,
      { workItem, parent: parent ?? null, subtasks, branch },
      profile,
      workflowStep,
    );

    sendReadCommandForTab(this.activeTabId, relativePath);
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
        extensionVersion: this.extensionVersion,
        workItem: null,
        parent: null,
        subtasks: [],
        screen: this.currentScreen,
        connectionStatus: 'disconnected',
      }),
    );
  }

  private async fetchReviewsPullRequests(
    config: KanbrainConfig,
  ): Promise<{ pullRequests: PullRequestSummary[]; failedCount: number }> {
    if (!this.client) return { pullRequests: [], failedCount: 0 };

    if (this.reviewsOwnerFilter !== 'fixed' && this.reviewsOwnerFilter !== 'needsMyFix') {
      const creatorId = this.reviewsOwnerFilter === 'mine' && this.currentUserId ? this.currentUserId : undefined;
      const reviewerId = this.reviewsOwnerFilter === 'assigned' && this.currentUserId ? this.currentUserId : undefined;
      const perStatus = await Promise.all(
        this.reviewsStatusFilters.map(status =>
          this.client!.listProjectPullRequests(config.organization, config.project, status, { creatorId, reviewerId }),
        ),
      );
      return { pullRequests: perStatus.flat(), failedCount: 0 };
    }

    if (!this.currentUserId) return { pullRequests: [], failedCount: 0 };
    const isFixed = this.reviewsOwnerFilter === 'fixed';
    const base = await this.client.listProjectPullRequests(config.organization, config.project, 'active', {
      creatorId: isFixed ? undefined : this.currentUserId,
      reviewerId: isFixed ? this.currentUserId : undefined,
    });
    const classified = await Promise.all(
      base.map(async pr => {
        try {
          const threads = await this.client!.getPullRequestThreads(config.organization, config.project, pr.repositoryId, pr.id);
          const { hasAnyActiveThread, hasMyThreadsAllResolved } = classifyPrThreads(threads, this.currentUserId!);
          return { pr, keep: isFixed ? hasMyThreadsAllResolved : hasAnyActiveThread, failed: false };
        } catch {
          // One PR's thread fetch failing (network blip, deleted repo, etc.) shouldn't take down
          // the whole tab — just exclude that PR rather than rejecting the whole Promise.all.
          // The caller surfaces failedCount so this isn't silently indistinguishable from "nothing pending".
          return { pr, keep: false, failed: true };
        }
      }),
    );
    return {
      pullRequests: classified.filter(c => c.keep).map(c => c.pr),
      failedCount: classified.filter(c => c.failed).length,
    };
  }

  private async pollWorkItem(id: number, config: KanbrainConfig, options: { rerenderWhenDone: boolean }): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const [fetched] = await this.client.getWorkItems(config.organization, config.project, [id]);
      const workItem = fetched ?? null;
      let subtasks: WorkItem[] = [];
      let parent: WorkItem | null = null;
      if (workItem) {
        subtasks = filterOutRemoved(await this.client.getChildren(config.organization, config.project, workItem), config);
        if (workItem.parentId) {
          const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
          parent = fetchedParent ?? null;
        }
      }
      this.cardCache.set(id, { workItem, parent, subtasks, polledAt: Date.now() });
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError && (error.status === 401 || error.status === 403)) {
        // The session actually expired/was revoked — the next refresh() picks this up and shows the Connect screen.
        this.connectionStatus = 'disconnected';
      }
      // Transient failure (network, 5xx, timeout): leave any existing cache entry as-is and retry on a later poll.
    } finally {
      if (options.rerenderWhenDone && this.activeWorkItemId === id) {
        void this.refresh();
      }
    }
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
      const cached = this.cardCache.get(activeWorkItemIdAtStart);
      if (cached) {
        workItem = cached.workItem;
        parent = cached.parent;
        subtasks = cached.subtasks;
      }
      const cacheIsFresh = !!cached && Date.now() - cached.polledAt < POLL_INTERVAL_MS;
      if (!cacheIsFresh) {
        if (cached) {
          // Switching to (or staying on) a tab whose cache is stale — show what we already have
          // right away instead of blocking the tab switch on a network round-trip, and let the
          // background poll below swap in the fresh data (or the disconnected screen) once it lands.
          void this.pollWorkItem(activeWorkItemIdAtStart, config, { rerenderWhenDone: true });
        } else {
          // Never polled this work item before — there is nothing to show without waiting once.
          await this.pollWorkItem(activeWorkItemIdAtStart, config, { rerenderWhenDone: false });
          if (this.connectionStatus === 'disconnected') {
            this.renderDisconnected(config);
            return;
          }
          const freshlyCached = this.cardCache.get(activeWorkItemIdAtStart);
          workItem = freshlyCached?.workItem ?? null;
          parent = freshlyCached?.parent ?? null;
          subtasks = freshlyCached?.subtasks ?? [];
        }
      }
    }

    if (this.activeWorkItemId !== activeWorkItemIdAtStart) {
      // The active work item changed while this refresh was still fetching (e.g. Clear/pick
      // raced a slower in-flight poll) — discard this now-stale result instead of overwriting
      // the newer state.
      return;
    }

    if (config && this.client && this.tabs.length > 0) {
      const idsNeeded = [...new Set(this.tabs.map(t => t.workItemId))].filter(id => !this.tabTypesCache.has(id));
      if (idsNeeded.length > 0) {
        try {
          const fetched = await this.client.getWorkItems(config.organization, config.project, idsNeeded);
          for (const item of fetched) {
            this.tabTypesCache.set(item.id, item.type);
          }
        } catch {
          // Transient failure — tab icons stay blank for these ids until a later poll succeeds.
        }
      }
    }

    if (config && this.client && this.currentScreen === 'reviews') {
      if (this.reviewsOwnerFilter !== 'all' && this.currentUserId === undefined) {
        this.currentUserId = await this.client.getCurrentUserId();
      }
      const now = Date.now();
      const filterKey = `${this.reviewsStatusFilters.join(',')}|${this.reviewsOwnerFilter}`;
      const filterChanged = this.lastReviewsFilterKeyFetched !== filterKey;
      if (filterChanged || now - this.lastReviewsFetchAt >= REVIEWS_POLL_INTERVAL_MS) {
        const { pullRequests, failedCount } = await this.fetchReviewsPullRequests(config);
        this.reviewsPullRequests = pullRequests;
        this.reviewsFetchFailedCount = failedCount;
        this.lastReviewsFetchAt = now;
        this.lastReviewsFilterKeyFetched = filterKey;
      }
    }

    // Whether the assignee actually renders is decided per work item type by resolveShowAssignedTo
    // (mirrored from the real board), so avatars are always resolved here rather than gated by the
    // (now search-only) manual showAssignedTo toggle.
    const avatars = config ? await this.resolveAvatars([workItem, parent, ...subtasks].filter((w): w is WorkItem => !!w)) : {};

    const tabsForRender = this.tabs.map(tab => ({ ...tab, type: this.tabTypesCache.get(tab.workItemId) }));
    const reviewsExtra = {
      pullRequests: this.reviewsPullRequests,
      failedCount: this.reviewsFetchFailedCount,
      tabs: tabsForRender,
      activeTabId: this.activeTabId,
    };
    if (!hasStateChanged(this.lastState, config, workItem, subtasks, avatars, reviewsExtra)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks, avatars, reviewsExtra);
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        extensionVersion: this.extensionVersion,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedTeam: this.selectedTeam,
        parentCollapsed: this.parentCollapsed,
        childrenCollapsed: this.childrenCollapsed,
        openBrainSegment: this.openBrainSegment,
        reviewsPullRequests: this.reviewsPullRequests,
        reviewsStatusFilters: this.reviewsStatusFilters,
        reviewsOwnerFilter: this.reviewsOwnerFilter,
        reviewsFetchFailedCount: this.reviewsFetchFailedCount,
        tabs: tabsForRender,
        activeTabId: this.activeTabId,
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

    function disableReviewsFilterControls(triggerEl) {
      const filtersContainer = triggerEl.closest('.kb-reviews-filters');
      if (!filtersContainer) return;
      filtersContainer.querySelectorAll('input[type="checkbox"], .kb-status-select-option').forEach((el) => { el.disabled = true; });
    }

    function saveSkillRow(row) {
      const label = row.querySelector('[data-field="label"]').value;
      if (row.dataset.profileId) {
        vscode.postMessage({
          type: 'save-profile-entry',
          id: row.dataset.profileId,
          label,
          description: row.querySelector('[data-field="description"]').value,
        });
      } else {
        const isGlobalField = row.querySelector('[data-field="isGlobal"]');
        vscode.postMessage({
          type: 'save-skill-entry',
          id: row.dataset.skillId,
          path: row.querySelector('[data-field="path"]').value,
          label,
          textColor: row.querySelector('[data-field="textColor"]').value,
          buttonColor: row.querySelector('[data-field="buttonColor"]').value,
          isGlobal: isGlobalField ? isGlobalField.checked : false,
        });
      }
    }

    function saveWorkflowStepRow(row) {
      vscode.postMessage({
        type: 'save-workflow-step',
        level: row.dataset.level,
        status: row.dataset.status,
        skillId: row.querySelector('[data-field="skillId"]').value,
        definitionOfDone: row.querySelector('[data-field="definitionOfDone"]').value,
        artifacts: row.querySelector('[data-field="artifacts"]').value,
      });
    }

    document.querySelectorAll('.kb-config-row:not(.kb-workflow-row) input, .kb-config-row:not(.kb-workflow-row) textarea').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-config-row');
        if (row) {
          saveSkillRow(row);
        }
      });
    });

    document.querySelectorAll('.kb-config-row:not(.kb-workflow-row) input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const row = checkbox.closest('.kb-config-row');
        if (row) {
          saveSkillRow(row);
        }
      });
    });

    function autosizeWorkflowTextarea(field) {
      field.style.height = 'auto';
      field.style.height = field.scrollHeight + 'px';
    }

    document.querySelectorAll('.kb-workflow-row textarea').forEach((field) => {
      autosizeWorkflowTextarea(field);
      field.addEventListener('input', () => autosizeWorkflowTextarea(field));
      field.addEventListener('blur', () => {
        const row = field.closest('.kb-workflow-row');
        if (row) {
          saveWorkflowStepRow(row);
        }
      });
    });

    function closeAllSkillPickers() {
      document.querySelectorAll('.kb-skill-picker-menu').forEach((menu) => menu.classList.add('kb-hidden'));
    }

    function saveRepositoryRow(row) {
      vscode.postMessage({
        type: 'save-repository-path',
        repositoryId: row.dataset.repositoryId,
        path: row.querySelector('[data-field="path"]').value,
      });
    }

    document.querySelectorAll('.kb-repo-row input[data-field="path"]').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-repo-row');
        if (row) {
          saveRepositoryRow(row);
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

    const profileSelect = document.getElementById('kb-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-profile', profileId: profileSelect.value });
      });
    }

    const ownerSelectTrigger = document.getElementById('kb-reviews-owner-trigger');
    const ownerSelectIcon = document.getElementById('kb-reviews-owner-icon');
    const ownerOptions = document.getElementById('kb-reviews-owner-options');

    function toggleOwnerDropdown() {
      if (ownerOptions) ownerOptions.classList.toggle('kb-hidden');
    }

    function closeOwnerDropdown() {
      if (ownerOptions) ownerOptions.classList.add('kb-hidden');
    }

    if (ownerSelectTrigger) {
      ownerSelectTrigger.addEventListener('click', toggleOwnerDropdown);
    }
    if (ownerSelectIcon) {
      ownerSelectIcon.addEventListener('click', toggleOwnerDropdown);
    }
    if (ownerOptions) {
      ownerOptions.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeOwnerDropdown();
      });
    }

    const statusSelectTrigger = document.getElementById('kb-reviews-status-trigger');
    const statusSelectIcon = document.getElementById('kb-reviews-status-icon');
    const statusOptions = document.getElementById('kb-reviews-status-options');
    const statusTriggerLabel = document.getElementById('kb-reviews-status-trigger-label');

    function toggleStatusDropdown() {
      if (statusOptions) statusOptions.classList.toggle('kb-hidden');
    }

    function closeStatusDropdown() {
      if (statusOptions) statusOptions.classList.add('kb-hidden');
    }

    if (statusSelectTrigger) {
      statusSelectTrigger.addEventListener('click', toggleStatusDropdown);
    }
    if (statusSelectIcon) {
      statusSelectIcon.addEventListener('click', toggleStatusDropdown);
    }
    if (statusOptions) {
      statusOptions.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeStatusDropdown();
      });
      statusOptions.querySelectorAll('input[data-status]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const checkedBoxes = statusOptions.querySelectorAll('input[data-status]:checked');
          if (!checkbox.checked && checkedBoxes.length === 0) {
            // At least one status must always stay selected — revert instead of sending an
            // update the server would reject anyway.
            checkbox.checked = true;
            return;
          }
          if (statusTriggerLabel) {
            const labels = [...checkedBoxes].map((cb) => cb.dataset.label);
            statusTriggerLabel.textContent = labels.join(', ');
          }
          disableReviewsFilterControls(checkbox);
          setLoading(checkbox.closest('.kb-checkbox-row'));
          vscode.postMessage({ type: 'toggle-reviews-status-filter', status: checkbox.dataset.status });
        });
      });
    }

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'kb-toggle-search-btn' || target.id === 'kb-footer-select-work-item-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          section.dataset.mode = 'replace';
          const wasHidden = section.classList.contains('kb-hidden');
          section.classList.toggle('kb-hidden');
          if (wasHidden) {
            activeQueryId = null;
            setQueryTriggerLabel(QUERY_PLACEHOLDER, true);
            if (queryClearBtn) queryClearBtn.classList.add('kb-hidden');
            closeQueryDropdown();
            // Don't fire the default (no-query) search here: whether a saved query was
            // selected last time is only known once load-saved-queries responds, and firing
            // both in parallel is a race — whichever response lands last wins, sometimes
            // showing the wrong list. The saved-queries handler below fires the single,
            // correctly-scoped search once it knows.
            vscode.postMessage({ type: 'load-saved-queries' });
            document.getElementById('kb-search-input')?.focus();
          }
        }
      } else if (target.id === 'kb-add-tab-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          section.dataset.mode = 'add';
          section.classList.remove('kb-hidden');
          activeQueryId = null;
          setQueryTriggerLabel(QUERY_PLACEHOLDER, true);
          if (queryClearBtn) queryClearBtn.classList.add('kb-hidden');
          closeQueryDropdown();
          vscode.postMessage({ type: 'load-saved-queries' });
          document.getElementById('kb-search-input')?.focus();
        }
      } else if (target.closest && target.closest('[data-action="close-tab"]')) {
        vscode.postMessage({ type: 'close-tab', tabId: target.closest('[data-action="close-tab"]').dataset.tabId });
      } else if (target.closest && target.closest('[data-action="select-tab"]')) {
        vscode.postMessage({ type: 'select-tab', tabId: target.closest('[data-action="select-tab"]').dataset.tabId });
      } else if (target.id === 'kb-history-btn') {
        const section = document.getElementById('kb-history-section');
        if (section) {
          section.classList.remove('kb-hidden');
          vscode.postMessage({ type: 'load-work-item-history' });
        }
      } else if (target.id === 'kb-history-close-btn') {
        document.getElementById('kb-history-section')?.classList.add('kb-hidden');
      } else if (target.id === 'kb-history-section' && target.classList.contains('kb-search-overlay')) {
        target.classList.add('kb-hidden');
      } else if (target.id === 'kb-clear-btn') {
        vscode.postMessage({ type: 'clear-work-item' });
      } else if (target.id === 'kb-run-setup-btn') {
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
      } else if (target.id === 'kb-open-flow-btn' || (target.closest && target.closest('#kb-footer-work-item-btn'))) {
        vscode.postMessage({ type: 'show-flow' });
      } else if (target.id === 'kb-show-config-btn') {
        vscode.postMessage({ type: 'show-config' });
      } else if (target.id === 'kb-show-brain-btn') {
        vscode.postMessage({ type: 'show-brain' });
      } else if (target.id === 'kb-show-reviews-btn') {
        vscode.postMessage({ type: 'show-reviews' });
      } else if (target.dataset && target.dataset.action === 'set-reviews-owner-filter' && !target.classList.contains('kb-status-select-option-active')) {
        closeOwnerDropdown();
        disableReviewsFilterControls(target);
        setLoading(target);
        vscode.postMessage({ type: 'set-reviews-owner-filter', value: target.dataset.value });
      } else if (target.dataset && target.dataset.action === 'pick-repository-folder') {
        const row = target.closest('.kb-repo-row');
        if (row) {
          vscode.postMessage({ type: 'pick-repository-folder', repositoryId: row.dataset.repositoryId });
        }
      } else if (target.dataset && target.dataset.action === 'clone-repository') {
        const row = target.closest('.kb-repo-row');
        if (row) {
          vscode.postMessage({ type: 'clone-repository', repositoryId: row.dataset.repositoryId });
        }
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
        const pickedId = target.closest('[data-action="pick-work-item"]').dataset.id;
        const searchSectionEl = document.getElementById('kb-search-section');
        if (searchSectionEl && searchSectionEl.dataset.mode === 'add') {
          vscode.postMessage({ type: 'add-tab', id: pickedId });
        } else {
          vscode.postMessage({ type: 'pick-work-item', id: pickedId });
        }
      } else if (target.dataset && target.dataset.action === 'open-work-item-detail') {
        vscode.postMessage({ type: 'open-work-item-detail', id: target.dataset.id });
      } else if (target.closest && target.closest('[data-action="select-query"]')) {
        const option = target.closest('[data-action="select-query"]');
        activeQueryId = option.dataset.id;
        setQueryTriggerLabel(option.dataset.path, false);
        closeQueryDropdown();
        if (queryClearBtn) queryClearBtn.classList.remove('kb-hidden');
        triggerSearch();
        vscode.postMessage({ type: 'set-selected-saved-query', queryId: activeQueryId });
      } else if (target.closest && target.closest('a.kb-repo-tag-unmapped')) {
        // Let the command: link navigate instead of toggling the enclosing group header.
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
        const toggle = target.closest('[data-action="toggle-group"]');
        const parentHeader = toggle.closest('.kb-config-parent-header');
        const container = parentHeader || toggle;
        const items = container.nextElementSibling;
        if (items) {
          const wasHidden = items.classList.contains('kb-hidden');
          if (parentHeader && wasHidden) {
            document.querySelectorAll('.kb-config-parent-section > .kb-collapsible-body').forEach((body) => {
              if (body !== items) {
                body.classList.add('kb-hidden');
                body.parentElement.classList.remove('kb-config-parent-section-expanded');
              }
            });
          }
          items.classList.toggle('kb-hidden');
          if (!items.classList.contains('kb-hidden')) {
            // Textareas revealed just now were sized while hidden (scrollHeight reads 0 on
            // display:none elements), so they need to be measured again now that they're visible.
            items.querySelectorAll('.kb-workflow-textarea').forEach((field) => autosizeWorkflowTextarea(field));
          }
          if (parentHeader) {
            parentHeader.parentElement.classList.toggle('kb-config-parent-section-expanded', wasHidden);
            if (toggle.dataset.segment) {
              vscode.postMessage({ type: 'set-open-brain-segment', segment: wasHidden ? toggle.dataset.segment : null });
            }
          }
        }
        if (toggle.dataset.section) {
          vscode.postMessage({ type: 'toggle-section', section: toggle.dataset.section });
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
        activeSearchTab = target.dataset.tab;
        applySearchTab();
      } else if (target.dataset && target.dataset.action === 'pick-skill-file') {
        const row = target.closest('.kb-config-row');
        if (row) {
          vscode.postMessage({ type: 'pick-skill-file', id: row.dataset.skillId });
        }
      } else if (target.dataset && target.dataset.action === 'add-skill') {
        vscode.postMessage({ type: 'add-skill' });
      } else if (target.dataset && target.dataset.action === 'remove-skill') {
        vscode.postMessage({ type: 'remove-skill', id: target.dataset.skillId });
      } else if (target.dataset && target.dataset.action === 'run-segment-ai') {
        setLoading(target);
        vscode.postMessage({ type: 'run-segment-ai', segment: target.dataset.segment });
      } else if (target.dataset && target.dataset.action === 'add-profile') {
        vscode.postMessage({ type: 'add-profile' });
      } else if (target.dataset && target.dataset.action === 'remove-profile') {
        vscode.postMessage({ type: 'remove-profile', id: target.dataset.profileId });
      } else if (target.dataset && target.dataset.action === 'toggle-global-skill-menu') {
        const group = target.closest('.kb-action-group');
        const menu = group ? group.querySelector('.kb-global-skill-menu') : null;
        if (menu) {
          const isOpen = !menu.classList.contains('kb-hidden');
          closeAllGlobalSkillMenus();
          if (!isOpen) {
            const rect = group.getBoundingClientRect();
            menu.style.left = rect.left + 'px';
            menu.style.top = rect.bottom + 2 + 'px';
            menu.style.width = rect.width + 'px';
            menu.classList.remove('kb-hidden');
          }
        }
      } else if (target.dataset && target.dataset.action === 'run-global-skill') {
        vscode.postMessage({ type: 'run-skill-by-id', workItemId: target.dataset.id, skillId: target.dataset.skillId });
        closeAllGlobalSkillMenus();
      } else if (target.closest && target.closest('[data-action="toggle-skill-picker"]')) {
        const picker = target.closest('.kb-skill-picker');
        const menu = picker ? picker.querySelector('.kb-skill-picker-menu') : null;
        if (menu) {
          const isOpen = !menu.classList.contains('kb-hidden');
          closeAllSkillPickers();
          if (!isOpen) {
            const rect = picker.getBoundingClientRect();
            menu.style.left = rect.left + 'px';
            menu.style.top = rect.bottom + 2 + 'px';
            menu.style.width = rect.width + 'px';
            menu.classList.remove('kb-hidden');
          }
        }
      } else if (target.closest && target.closest('[data-action="select-skill"]')) {
        const option = target.closest('[data-action="select-skill"]');
        const picker = option.closest('.kb-skill-picker');
        const row = option.closest('.kb-workflow-row');
        if (picker && row) {
          const skillId = option.dataset.skillId;
          const hiddenInput = picker.querySelector('[data-field="skillId"]');
          if (hiddenInput) hiddenInput.value = skillId;
          picker.querySelectorAll('.kb-skill-picker-option').forEach((opt) => {
            opt.classList.toggle('kb-skill-picker-option-active', opt === option);
          });
          const triggerLabel = picker.querySelector('.kb-skill-picker-trigger-label');
          if (triggerLabel) {
            triggerLabel.textContent = option.querySelector('.kb-skill-picker-option-label').textContent;
            triggerLabel.classList.toggle('kb-select-none-option', !skillId);
          }
          closeAllSkillPickers();
          saveWorkflowStepRow(row);
        }
      }

      if (
        (!target.closest || !target.closest('[data-action="toggle-global-skill-menu"]')) &&
        (!target.closest || !target.closest('.kb-global-skill-menu'))
      ) {
        closeAllGlobalSkillMenus();
      }

      if (!target.closest || !target.closest('.kb-skill-picker')) {
        closeAllSkillPickers();
      }

      if (!target.closest || !target.closest('.kb-query-combobox')) {
        closeQueryDropdown();
      }

      // Both the status and owner selects share the .kb-status-select wrapper class (same
      // widget, two instances), so scope each outside-click check to its own trigger/icon/
      // dropdown trio by id rather than the shared class — otherwise a click inside one would
      // also count as "inside" the other and never close it.
      if (!target.closest || !target.closest('#kb-reviews-status-trigger, #kb-reviews-status-icon, #kb-reviews-status-options')) {
        closeStatusDropdown();
      }

      if (!target.closest || !target.closest('#kb-reviews-owner-trigger, #kb-reviews-owner-icon, #kb-reviews-owner-options')) {
        closeOwnerDropdown();
      }
    });

    function closeAllGlobalSkillMenus() {
      document.querySelectorAll('.kb-global-skill-menu').forEach((menu) => menu.classList.add('kb-hidden'));
    }

    window.addEventListener('scroll', (event) => {
      if (event.target && event.target.closest && event.target.closest('.kb-global-skill-menu')) {
        return;
      }
      closeAllGlobalSkillMenus();
      if (!(event.target && event.target.closest && event.target.closest('.kb-skill-picker-menu'))) {
        closeAllSkillPickers();
      }
    }, true);

    const searchInput = document.getElementById('kb-search-input');
    const queryTrigger = document.getElementById('kb-query-trigger');
    const queryTriggerLabel = document.getElementById('kb-query-trigger-label');
    const queryFilterInput = document.getElementById('kb-query-filter-input');
    const queryClearBtn = document.getElementById('kb-query-clear-btn');
    const queryOptions = document.getElementById('kb-query-options');
    const queryOptionsList = document.getElementById('kb-query-options-list');
    const queryComboboxIcon = document.getElementById('kb-query-combobox-icon');
    let activeQueryId = null;

    const QUERY_PLACEHOLDER = 'Filter by saved query...';

    function setQueryTriggerLabel(text, isPlaceholder) {
      if (!queryTriggerLabel) return;
      queryTriggerLabel.textContent = text;
      queryTriggerLabel.classList.toggle('kb-query-trigger-placeholder', isPlaceholder);
    }

    function closeQueryDropdown() {
      if (queryOptions) queryOptions.classList.add('kb-hidden');
      if (queryFilterInput) queryFilterInput.value = '';
      if (queryOptionsList) {
        queryOptionsList.querySelectorAll('.kb-query-option').forEach((opt) => { opt.hidden = false; });
      }
    }

    function toggleQueryDropdown() {
      if (!queryOptions) return;
      if (queryOptions.classList.contains('kb-hidden')) {
        queryOptions.classList.remove('kb-hidden');
        if (queryFilterInput) queryFilterInput.focus();
      } else {
        closeQueryDropdown();
      }
    }

    function triggerSearch() {
      vscode.postMessage({ type: 'search-work-items', query: searchInput ? searchInput.value : '', queryId: activeQueryId || undefined });
    }

    if (searchInput) {
      searchInput.addEventListener('input', triggerSearch);
    }

    const assignedToMeCheckbox = document.getElementById('kb-search-assigned-to-me');
    if (assignedToMeCheckbox) {
      assignedToMeCheckbox.addEventListener('change', () => {
        vscode.postMessage({
          type: 'set-search-assigned-to-me',
          value: assignedToMeCheckbox.checked,
          query: searchInput ? searchInput.value : '',
          queryId: activeQueryId || undefined,
        });
      });
    }

    if (queryTrigger) {
      queryTrigger.addEventListener('click', toggleQueryDropdown);
    }

    if (queryComboboxIcon) {
      queryComboboxIcon.addEventListener('click', toggleQueryDropdown);
    }

    if (queryFilterInput) {
      queryFilterInput.addEventListener('input', () => {
        const needle = queryFilterInput.value.trim().toLowerCase();
        if (queryOptionsList) {
          queryOptionsList.querySelectorAll('.kb-query-option').forEach((opt) => {
            opt.hidden = needle !== '' && !opt.dataset.path.toLowerCase().includes(needle);
          });
        }
      });
      queryFilterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          queryFilterInput.blur();
        }
      });
      queryFilterInput.addEventListener('blur', () => {
        // Delayed so a simultaneous click on a dropdown option (which blurs this field first,
        // then fires its own click) gets to run first — blur fires before click in the
        // browser's event order.
        setTimeout(() => {
          closeQueryDropdown();
        }, 150);
      });
    }

    if (queryClearBtn) {
      queryClearBtn.addEventListener('click', () => {
        activeQueryId = null;
        setQueryTriggerLabel(QUERY_PLACEHOLDER, true);
        queryClearBtn.classList.add('kb-hidden');
        closeQueryDropdown();
        triggerSearch();
        vscode.postMessage({ type: 'set-selected-saved-query', queryId: undefined });
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'search-results') {
        const results = document.getElementById('kb-search-results');
        if (results) {
          results.innerHTML = event.data.html;
          applySearchTab();
        }
      } else if (event.data.type === 'work-item-history') {
        const results = document.getElementById('kb-history-results');
        if (results) results.innerHTML = event.data.html;
      } else if (event.data.type === 'saved-queries') {
        if (queryOptionsList) queryOptionsList.innerHTML = event.data.html;
        if (event.data.selectedQueryId && event.data.selectedQueryPath) {
          activeQueryId = event.data.selectedQueryId;
          setQueryTriggerLabel(event.data.selectedQueryPath, false);
          if (queryClearBtn) queryClearBtn.classList.remove('kb-hidden');
        }
        // Exactly one search fires per dialog open, only now that we know whether a saved
        // query was previously selected — see the comment at the load-saved-queries call site.
        triggerSearch();
      } else if (event.data.type === 'skill-file-picked') {
        const rows = document.querySelectorAll('.kb-config-row');
        for (const row of rows) {
          if (row.dataset.skillId === event.data.id) {
            const pathInput = row.querySelector('[data-field="path"]');
            pathInput.value = event.data.path;
            saveSkillRow(row);
            break;
          }
        }
      } else if (event.data.type === 'repository-folder-picked') {
        const rows = document.querySelectorAll('.kb-repo-row');
        for (const row of rows) {
          if (row.dataset.repositoryId === event.data.repositoryId) {
            const pathInput = row.querySelector('[data-field="path"]');
            pathInput.value = event.data.path;
            saveRepositoryRow(row);
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
      body { font-family: var(--vscode-font-family); padding: 8px 8px 48px; box-sizing: border-box; height: 100vh; display: flex; flex-direction: column; }
      .kb-tab-bar { display: flex; align-items: center; gap: 2px; overflow-x: auto; flex-shrink: 0; margin-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
      .kb-tab { display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); opacity: 0.75; cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; white-space: nowrap; flex-shrink: 0; }
      .kb-tab + .kb-tab { border-left: 1px solid var(--vscode-panel-border); }
      .kb-tab:hover { background: var(--vscode-list-hoverBackground); opacity: 1; }
      .kb-tab-active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
      .kb-tab-close { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 2px; opacity: 0.7; }
      .kb-tab-close:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1)); }
      .kb-tab-add { flex-shrink: 0; width: 22px; height: 22px; padding: 0; background: transparent; border: none; color: var(--vscode-foreground); opacity: 0.75; cursor: pointer; font-size: 14px; border-radius: 2px; }
      .kb-tab-add:hover:not(:disabled) { opacity: 1; background: var(--vscode-list-hoverBackground); }
      .kb-tab-add:disabled { opacity: 0.3; cursor: not-allowed; }
      .kb-main-card, .kb-subtask-card { position: relative; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
      .kb-pick-btn { position: absolute; top: 4px; right: 4px; }
      .kb-team-card { margin: 10px; }
      .kb-team-card select { box-sizing: border-box; width: 100%; padding: 4px 6px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; font-family: var(--vscode-font-family); }
      .kb-card-header { display: flex; align-items: center; padding-right: 26px; }
      .kb-type-icon { display: inline-flex; width: 14px; height: 14px; margin-right: 6px; flex-shrink: 0; }
      .kb-type-icon svg { width: 100%; height: 100%; }
      .kb-status-row { display: flex; align-items: center; margin-top: 4px; font-size: 12px; opacity: 0.85; }
      .kb-title { font-weight: 600; margin-left: 6px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kb-title-clickable { cursor: pointer; }
      .kb-title-clickable:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
      .kb-action-btn { margin-top: 6px; padding: 4px 8px; background-color: var(--vscode-button-background); background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.3)); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-action-btn:hover { filter: brightness(1.12); }
      .kb-action-group { position: relative; display: inline-block; margin-top: 6px; }
      .kb-action-pill { display: inline-flex; align-items: stretch; border-radius: 6px; overflow: hidden; }
      .kb-action-pill .kb-action-btn { margin-top: 0; border-radius: 0; }
      .kb-action-btn-placeholder { background-color: var(--vscode-dropdown-background); background-image: none; color: var(--vscode-dropdown-foreground); opacity: 0.7; cursor: default; }
      .kb-action-btn-placeholder:hover { filter: none; }
      .kb-global-skill-trigger { padding: 4px 8px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: none; border-left: 1px solid var(--vscode-panel-border); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-global-skill-trigger:hover { background: var(--vscode-list-hoverBackground); }
      .kb-global-skill-menu { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 160px; max-height: 240px; overflow-y: auto; overflow-x: hidden; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 6px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
      .kb-global-skill-option { width: 100%; max-width: 100%; box-sizing: border-box; flex-shrink: 0; text-align: left; padding: 6px 8px; background-color: var(--vscode-dropdown-background); background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.3)); border: none; border-radius: 4px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kb-global-skill-option:hover { filter: brightness(1.12); }
      .kb-empty { opacity: 0.7; padding: 12px 0; }
      .kb-section-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 18px 0 8px; padding: 6px 10px; font-size: 13px; font-weight: 600; color: var(--vscode-foreground); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-list-hoverBackground)); border-radius: 3px; }
      button.kb-section-label { appearance: none; -webkit-appearance: none; border: none; width: 100%; text-align: left; cursor: pointer; font-family: var(--vscode-font-family); }
      button.kb-section-label:hover, .kb-section-label[data-action="toggle-group"]:hover { background: var(--vscode-list-hoverBackground); }
      .kb-section-label[data-action="toggle-group"] { width: 100%; box-sizing: border-box; cursor: pointer; }
      .kb-section-label:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
      .kb-section-actions { display: flex; gap: 2px; }
      .kb-hidden { display: none; }
      .kb-result-item { width: 100%; margin: 2px 0; }
      .kb-result-item-footer { display: flex; align-items: center; margin-top: 2px; padding: 0 6px; }
      .kb-view-details-link { margin-left: auto; background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 11px; padding: 2px 4px; }
      .kb-view-details-link:hover { text-decoration: underline; }
      #kb-search-input { box-sizing: border-box; width: 100%; flex: 0 0 auto; padding: 4px 6px; margin-bottom: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-footer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; align-items: center; gap: 2px; padding: 4px 6px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); border-top: 1px solid var(--vscode-panel-border); }
      .kb-footer-btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 7px; background: none; border: none; border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 14px; line-height: 1; }
      .kb-footer-btn:hover { background: var(--vscode-list-hoverBackground); }
      .kb-footer-btn-active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); }
      .kb-footer-btn-active:hover { background: var(--vscode-list-activeSelectionBackground); }
      .kb-footer-work-item-id { font-size: 12px; font-weight: 600; }
      .kb-footer-divider { width: 1px; align-self: stretch; margin: 4px 4px; background: var(--vscode-panel-border); }
      .kb-footer-spacer { flex: 1; }
      .kb-secondary-btn { box-sizing: border-box; padding: 8px 12px; text-align: center; font-size: 12px; font-weight: 500; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 4px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-secondary-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
      .kb-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
      .kb-result-group { margin-bottom: 4px; }
      .kb-group-toggle { display: flex; align-items: center; justify-content: flex-start; gap: 4px; width: 100%; text-align: left; background: transparent; border: none; border-radius: 0; padding: 0; margin: 12px 0 0; font-size: 11px; font-weight: 400; text-transform: uppercase; opacity: 0.7; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); appearance: none; -webkit-appearance: none; }
      .kb-search-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-start; justify-content: center; padding: 24px 12px; z-index: 100; }
      .kb-search-overlay.kb-hidden { display: none; }
      .kb-search-dialog { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; width: 100%; max-width: 640px; max-height: 100%; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); }
      .kb-search-dialog-header { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-bottom: 6px; }
      .kb-query-combobox { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; padding: 0 4px; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; }
      .kb-query-combobox:hover { background: var(--vscode-list-hoverBackground); }
      .kb-query-combobox:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-query-trigger { flex: 1; min-width: 0; padding: 4px 2px; cursor: pointer; }
      .kb-query-trigger-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-dropdown-foreground); font-family: var(--vscode-font-family); font-size: 13px; }
      .kb-query-trigger-placeholder { opacity: 0.6; }
      .kb-query-clear-btn { flex-shrink: 0; background: transparent; border: none; padding: 2px; color: var(--vscode-errorForeground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; line-height: 1; }
      .kb-query-clear-btn:hover { opacity: 0.8; }
      .kb-query-combobox-icon { flex-shrink: 0; padding: 0 4px; font-size: 14px; opacity: 0.7; color: var(--vscode-dropdown-foreground); cursor: pointer; }
      .kb-query-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; margin-top: 2px; display: flex; flex-direction: column; gap: 4px; padding: 4px; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
      .kb-query-dropdown.kb-hidden { display: none; }
      #kb-query-filter-input { box-sizing: border-box; width: 100%; flex-shrink: 0; padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-query-filter-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      #kb-query-options-list { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
      .kb-query-option { width: 100%; box-sizing: border-box; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kb-query-option:hover { background: var(--vscode-list-hoverBackground); }
      .kb-query-option:disabled { opacity: 0.5; cursor: default; }
      .kb-query-option:disabled:hover { background: none; }
      .kb-query-type-badge { margin-left: 4px; font-size: 10px; opacity: 0.7; }
      .kb-dialog-title { flex: 1; min-width: 0; font-size: 12px; }
      #kb-search-results { overflow-y: auto; flex: 1; min-height: 0; }
      .kb-dialog-close-btn { flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 0; border-radius: 2px; font-family: var(--vscode-font-family); font-size: 13px; }
      .kb-dialog-close-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
      .kb-dialog-close-btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      #kb-search-close-btn { flex-shrink: 0; background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 4px 6px; border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-search-close-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
      .kb-search-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 6px; }
      .kb-search-tab { flex-shrink: 0; padding: 4px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-search-tab:disabled { opacity: 0.5; cursor: default; }
      .kb-search-tab:hover { background: var(--vscode-list-hoverBackground); }
      .kb-search-tab-active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: 600; }
      .kb-search-tab-empty { opacity: 0.5; }
      .kb-section-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 16px; overflow: hidden; background: var(--vscode-editor-background); }
      .kb-parent-section, .kb-section-card-current { flex-shrink: 0; }
      .kb-section-card-children { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
      .kb-section-card-children:has(> .kb-collapsible-body.kb-hidden) { flex: 0 0 auto; }
      .kb-section-card-children > .kb-section-label { flex-shrink: 0; }
      .kb-section-card-children > .kb-collapsible-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
      .kb-section-card-current {
        border-color: transparent;
        background:
          linear-gradient(var(--vscode-editor-background), var(--vscode-editor-background)) padding-box,
          linear-gradient(135deg, var(--vscode-focusBorder), var(--vscode-panel-border)) border-box;
      }
      .kb-section-card .kb-section-label { margin: 0; border-radius: 0; }
      .kb-section-card .kb-home-commands, .kb-section-card .kb-checkbox-row, .kb-section-card .kb-empty { margin: 10px; }
      .kb-section-card .kb-main-card, .kb-section-card .kb-subtask-card, .kb-section-card .kb-review-row { margin: 8px 10px; }
      .kb-home-commands { display: flex; flex-direction: column; gap: 6px; }
      .kb-icon-btn { width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; border-radius: 2px; font-size: 13px; }
      .kb-icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
      .kb-input { box-sizing: border-box; width: 100%; padding: 4px 6px; margin-bottom: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-select-none-option { font-style: italic; color: var(--vscode-descriptionForeground); }
      .kb-skill-picker { position: relative; }
      .kb-skill-picker-trigger { display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: pointer; text-align: left; }
      .kb-skill-picker-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kb-skill-picker-icon { flex-shrink: 0; opacity: 0.7; font-size: 12px; }
      .kb-skill-picker-menu { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; padding: 4px; max-height: 260px; overflow-y: auto; overflow-x: hidden; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
      .kb-skill-picker-menu.kb-hidden { display: none; }
      .kb-skill-picker-option { width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 1px; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-skill-picker-option:hover { background: var(--vscode-list-hoverBackground); }
      .kb-skill-picker-option-active { background: var(--vscode-list-inactiveSelectionBackground); }
      .kb-skill-picker-option-label { font-size: 12px; }
      .kb-skill-picker-option-path { font-size: 11px; color: var(--vscode-descriptionForeground); }
      .kb-textarea { min-height: 60px; resize: vertical; }
      .kb-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-config-parent-section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-top: 8px; background: var(--vscode-sideBarSectionHeader-background, transparent); }
      .kb-config-parent-header { display: flex; align-items: stretch; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 8px; }
      .kb-parent-header-toggle { appearance: none; -webkit-appearance: none; border: none; background: transparent; padding: 0; cursor: pointer; display: flex; flex: 1; align-items: center; font: inherit; color: inherit; }
      .kb-config-parent-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
      .kb-brain-segments { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .kb-config-parent-section-expanded { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .kb-config-parent-section-expanded > .kb-collapsible-body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .kb-segment-scroll { flex: 1; min-height: 0; overflow-y: auto; }
      .kb-config-level { position: relative; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 6px 0; }
      .kb-config-level-header { display: flex; align-items: center; width: 100%; text-align: left; padding: 6px 32px 6px 8px; background: var(--vscode-editor-background); border: none; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kb-config-level-header:hover { background: var(--vscode-list-hoverBackground); }
      .kb-remove-skill-btn { position: absolute; top: 3px; right: 4px; }
      .kb-icon-btn-danger { color: var(--vscode-errorForeground, #f14c4c); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-foreground); border-radius: 3px; }
      .kb-icon-btn-danger:hover { filter: brightness(1.2); }
      .kb-info-icon { cursor: help; color: var(--vscode-descriptionForeground); margin-left: 2px; }
      .kb-global-skill-header { background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.3)); }
      .kb-global-skill-header:hover { background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.3)); filter: brightness(1.12); }
      .kb-config-level-body { padding: 6px 8px; }
      .kb-config-static-header { padding: 6px 8px; font-family: var(--vscode-font-family); font-size: 12px; font-weight: 600; color: var(--vscode-foreground); }
      .kb-chevron { display: inline-block; margin-right: 6px; transition: transform 0.15s ease; }
      .kb-config-level-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
      .kb-config-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }
      .kb-repo-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }
      .kb-repo-name { font-weight: 600; margin-bottom: 4px; font-size: 12px; }
      .kb-workflow-row { padding: 0; overflow: hidden; }
      .kb-workflow-row-body { padding: 6px; }
      .kb-config-row-status { display: flex; align-items: center; font-weight: 600; font-size: 12px; padding: 6px 8px; margin: 0; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
      .kb-workflow-textarea { resize: none; overflow-y: auto; max-height: 200px; }
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
      .kb-history-item { padding-bottom: 4px; }
      .kb-history-item-footer { gap: 8px; }
      .kb-history-item-status { display: flex; align-items: center; gap: 4px; margin: 0 6px 2px; font-size: 11px; opacity: 0.8; }
      .kb-history-item .kb-result-item-assignee { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .kb-history-item .kb-view-details-link { flex-shrink: 0; }
      .kb-result-item-main:disabled { opacity: 0.5; cursor: default; }
      .kb-result-item-main:disabled:hover { background: none; }
      .kb-current-badge { flex-shrink: 0; margin-left: 6px; padding: 1px 5px; border-radius: 8px; font-size: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
      .kb-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 6px 0; cursor: pointer; }
      .kb-checkbox-row:has(input:disabled) { opacity: 0.5; cursor: default; }
      .kb-status-select { position: relative; display: inline-flex; align-items: center; gap: 2px; padding: 0 4px; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; }
      .kb-status-select:hover { background: var(--vscode-list-hoverBackground); }
      .kb-status-select-disabled { opacity: 0.5; pointer-events: none; }
      .kb-status-select-trigger { padding: 4px 2px; cursor: pointer; }
      .kb-status-select-trigger-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; color: var(--vscode-dropdown-foreground); font-family: var(--vscode-font-family); font-size: 13px; }
      .kb-status-select-icon { flex-shrink: 0; padding: 0 4px; font-size: 14px; opacity: 0.7; color: var(--vscode-dropdown-foreground); cursor: pointer; }
      .kb-status-select-dropdown { position: absolute; top: 100%; left: 0; z-index: 50; margin-top: 2px; display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; min-width: 160px; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
      .kb-status-select-dropdown.kb-hidden { display: none; }
      .kb-status-select-dropdown .kb-checkbox-row { margin: 2px 0; white-space: nowrap; }
      .kb-status-select-option { width: 100%; box-sizing: border-box; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; white-space: nowrap; }
      .kb-status-select-option:hover { background: var(--vscode-list-hoverBackground); }
      .kb-status-select-option-active { font-weight: 600; }
      .kb-status-select-option:disabled { opacity: 0.5; cursor: default; }
      .kb-reviews-filters { display: flex; align-items: flex-start; gap: 8px; flex-shrink: 0; margin-bottom: 10px; }
      .kb-reviews-list { flex: 1; min-height: 0; overflow-y: auto; }
      .kb-review-repo-group .kb-collapsible-body { max-height: 240px; overflow-y: auto; }
      .kb-review-repo-group:only-child .kb-collapsible-body { max-height: none; }
      .kb-dev-badge { display: flex; align-items: center; gap: 4px; font-size: 12px; }
      .kb-dev-badge svg { flex-shrink: 0; }
      .kb-branch-tag, .kb-repo-tag { display: inline-flex; align-items: center; gap: 4px; max-width: 140px; padding: 1px 7px; border-radius: 10px; font-size: 11px; text-decoration: none; border: 1px solid; line-height: 1.6; }
      .kb-branch-tag svg, .kb-repo-tag svg { flex-shrink: 0; }
      .kb-tag-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kb-branch-tag { color: var(--vscode-charts-blue); border-color: var(--vscode-charts-blue); cursor: pointer; }
      .kb-branch-tag:hover { background: var(--vscode-charts-blue); color: var(--vscode-editor-background); }
      .kb-branch-tag-disabled { color: var(--vscode-descriptionForeground); border-color: var(--vscode-descriptionForeground); cursor: default; opacity: 0.7; }
      .kb-branch-tag-disabled:hover { background: none; color: var(--vscode-descriptionForeground); }
      .kb-repo-tag { color: var(--vscode-charts-orange); border-color: var(--vscode-charts-orange); }
      .kb-repo-tag-unmapped { border-style: dashed; cursor: pointer; }
      .kb-repo-tag-unmapped:hover { background: var(--vscode-charts-orange); color: var(--vscode-editor-background); }
      .kb-review-row { position: relative; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; padding: 8px 8px 8px 10px; border: 1px solid var(--vscode-panel-border); border-left: 3px solid var(--vscode-panel-border); border-radius: 4px; }
      .kb-review-row:hover { background: var(--vscode-list-hoverBackground); }
      .kb-review-row-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; color: var(--vscode-foreground); text-decoration: none; }
      .kb-review-row-title:hover { color: var(--vscode-textLink-foreground); }
      .kb-review-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .kb-review-row-author { font-size: 11px; opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
      .kb-review-group-count { flex-shrink: 0; opacity: 0.7; font-weight: 400; }
      .kb-loading { opacity: 0.6; cursor: default; }
      .kb-loading::after { content: ''; display: inline-block; width: 10px; height: 10px; margin-left: 6px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; vertical-align: middle; animation: kb-spin 0.6s linear infinite; }
      @keyframes kb-spin { to { transform: rotate(360deg); } }
    `;
  }
}
