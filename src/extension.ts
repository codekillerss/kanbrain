import * as vscode from 'vscode';
import { ensureAzureSession, hasCachedAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { WorkItemDetailPanelManager } from './view/WorkItemDetailPanelManager';
import { PullRequestDetailPanelManager } from './view/PullRequestDetailPanelManager';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
import { registerConfigureRepositoriesWithAiCommand } from './commands/configureRepositoriesWithAi';
import { registerConfigureSkillsWithAiCommand } from './commands/configureSkillsWithAi';
import { registerConfigureProfilesWithAiCommand } from './commands/configureProfilesWithAi';
import { registerConnectCommand } from './commands/connect';
import { registerOpenWorkItemDetailCommand } from './commands/openWorkItemDetail';
import { registerCheckoutBranchCommand } from './commands/checkoutBranch';
import { registerOpenPullRequestDetailCommand } from './commands/openPullRequestDetail';
import { registerPickWorkItemCommand } from './commands/pickWorkItem';
import { registerViewPullRequestDiffCommand } from './commands/viewPullRequestDiff';
import { registerViewPullRequestDiffAtLineCommand } from './commands/viewPullRequestDiffAtLine';
import { registerResolveRepositoryTagCommand } from './commands/resolveRepositoryTag';
import { registerOpenWorkItemInBrowserCommand } from './commands/openWorkItemInBrowser';
import { migrateLegacyLocalConfigIfNeeded } from './config/config';
import { bootstrapLocalRepositoriesIfNeeded } from './config/bootstrapLocalRepositories';
import { discoverLocalRepositories } from './git/discoverLocalRepositories';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';
const SELECTED_TEAM_KEY = 'kanbrain.selectedTeam';
const WORK_ITEM_HISTORY_KEY = 'kanbrain.workItemHistoryIds';
const SELECTED_SAVED_QUERY_KEY = 'kanbrain.selectedSavedQueryId';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const extensionVersion = context.extension.packageJSON.version as string;

  const client = workspaceRoot
    ? new AzureDevOpsClient({
        fetchImpl: fetch,
        getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
      })
    : undefined;

  let providerRef: KanbrainViewProvider | undefined;

  const detailPanelManager = workspaceRoot && client
    ? new WorkItemDetailPanelManager(workspaceRoot, client, context.extensionUri, () => providerRef?.getActiveWorkItemId())
    : undefined;
  const prDetailPanelManager = workspaceRoot && client ? new PullRequestDetailPanelManager(workspaceRoot, client, context.extensionUri) : undefined;

  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
    () => hasCachedAzureSession(getVscodeMicrosoftSession),
    async id => {
      if (detailPanelManager) {
        await detailPanelManager.open(id);
      }
    },
    team => context.workspaceState.update(SELECTED_TEAM_KEY, team),
    context.workspaceState.get<number[]>(WORK_ITEM_HISTORY_KEY, []),
    ids => context.workspaceState.update(WORK_ITEM_HISTORY_KEY, ids),
    context.workspaceState.get<string>(SELECTED_SAVED_QUERY_KEY),
    queryId => context.workspaceState.update(SELECTED_SAVED_QUERY_KEY, queryId),
  );
  providerRef = provider;

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider));

  if (!workspaceRoot || !client || !detailPanelManager || !prDetailPanelManager) {
    return;
  }

  if (migrateLegacyLocalConfigIfNeeded(workspaceRoot)) {
    vscode.window.showInformationMessage(
      'Kanbrain moved repository paths and display preferences out of .kanbrain/config.json into a new, gitignored .kanbrain/config.local.json. config.json no longer contains machine-specific data.',
    );
  }

  // Teammates cloning an already-configured project have config.json (committed) but no
  // config.local.json (gitignored, machine-specific repo paths), and nothing else generates it
  // for them short of re-running the full interactive Setup wizard. Fire-and-forget: only runs
  // when a session is already cached, so it never forces a login prompt on activation.
  void hasCachedAzureSession(getVscodeMicrosoftSession).then(async hasSession => {
    if (!hasSession) {
      return;
    }
    const bootstrapped = await bootstrapLocalRepositoriesIfNeeded(workspaceRoot, {
      listAzureRepositories: (organization, project) => client.listRepositories(organization, project),
      discoverLocalRepos: discoverLocalRepositories,
    }).catch(() => false);
    if (bootstrapped) {
      vscode.window.showInformationMessage(
        'Kanbrain discovered your local repository paths and wrote them to .kanbrain/config.local.json.',
      );
    }
  });

  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined), extensionVersion),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot, extensionVersion),
    registerConfigureWithAiCommand(client, workspaceRoot),
    registerConfigureRepositoriesWithAiCommand(client, workspaceRoot),
    registerConfigureSkillsWithAiCommand(client, workspaceRoot),
    registerConfigureProfilesWithAiCommand(client, workspaceRoot),
    registerConnectCommand(client, workspaceRoot, () => provider.markConnected()),
    registerOpenWorkItemDetailCommand(detailPanelManager),
    registerCheckoutBranchCommand(workspaceRoot),
    registerOpenPullRequestDetailCommand(prDetailPanelManager),
    registerPickWorkItemCommand(provider),
    registerViewPullRequestDiffCommand(workspaceRoot),
    registerViewPullRequestDiffAtLineCommand(workspaceRoot),
    registerResolveRepositoryTagCommand(workspaceRoot, provider),
    registerOpenWorkItemInBrowserCommand(),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId, false);
  }

  const savedTeam = context.workspaceState.get<string>(SELECTED_TEAM_KEY);
  if (savedTeam) {
    provider.setSelectedTeam(savedTeam);
  }
}

export function deactivate(): void {}
