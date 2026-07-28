import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, RepositoryPathEntry } from '../types';
import { runMigrations } from './migrations';

export const DEFAULT_REPO_SCAN_DEPTH = 2;

interface LocalConfig {
  repositories?: Record<string, RepositoryPathEntry>;
  showAssignedTo?: boolean;
  selectedProfileId?: string;
}

export function getConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.json');
}

export function getConfigLocalPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.local.json');
}

function readLocalConfig(workspaceRoot: string): LocalConfig {
  const localPath = getConfigLocalPath(workspaceRoot);
  if (!fs.existsSync(localPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  } catch {
    return {};
  }
}

function extractLocalFields(config: KanbrainConfig): LocalConfig {
  const local: LocalConfig = {};
  if (config.repositories !== undefined) {
    local.repositories = config.repositories;
  }
  if (config.showAssignedTo !== undefined) {
    local.showAssignedTo = config.showAssignedTo;
  }
  if (config.selectedProfileId !== undefined) {
    local.selectedProfileId = config.selectedProfileId;
  }
  return local;
}

function writeLocalConfig(workspaceRoot: string, local: LocalConfig): void {
  const localPath = getConfigLocalPath(workspaceRoot);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, `${JSON.stringify(local, null, 2)}\n`, 'utf-8');
  ensureGitignoreEntry(workspaceRoot, '.kanbrain/config.local.json');
}

// One-time migration for configs written before config.local.json existed: repositories/showAssignedTo
// were still inline in config.json. Gated on the local file's absence (not on lastSyncedVersion, which
// isn't bumped by every write path) so it runs exactly once per workspace, regardless of when it's
// called. Operates on the raw parsed JSON, before runMigrations, so it only ever touches these two keys
// and leaves the rest of config.json's shape exactly as found - it doesn't force any other pending shape
// migration to persist early. Callers decide when to invoke this (once, at startup) rather than it
// running on every read - see extension.ts's activate(), which also reports the return value to the user.
export function migrateLegacyLocalConfigIfNeeded(workspaceRoot: string): boolean {
  const configPath = getConfigPath(workspaceRoot);
  if (fs.existsSync(getConfigLocalPath(workspaceRoot)) || !fs.existsSync(configPath)) {
    return false;
  }
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return false;
  }
  if (!parsedRaw || typeof parsedRaw !== 'object') {
    return false;
  }
  const { repositories, showAssignedTo, ...rest } = parsedRaw as Record<string, unknown>;
  if (repositories === undefined && showAssignedTo === undefined) {
    return false;
  }
  const local: LocalConfig = {};
  if (repositories !== undefined) {
    local.repositories = repositories as Record<string, RepositoryPathEntry>;
  }
  if (showAssignedTo !== undefined) {
    local.showAssignedTo = showAssignedTo as boolean;
  }
  writeLocalConfig(workspaceRoot, local);
  fs.writeFileSync(configPath, `${JSON.stringify(rest, null, 2)}\n`, 'utf-8');
  return true;
}

function applyLocalOverlay(config: KanbrainConfig, workspaceRoot: string): KanbrainConfig {
  const local = readLocalConfig(workspaceRoot);
  const result = { ...config };
  if ('repositories' in local) {
    result.repositories = local.repositories;
  }
  if ('showAssignedTo' in local) {
    result.showAssignedTo = local.showAssignedTo;
  }
  if ('selectedProfileId' in local) {
    result.selectedProfileId = local.selectedProfileId;
  }
  return result;
}

export function readConfig(workspaceRoot: string): KanbrainConfig | null {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    return applyLocalOverlay(runMigrations(JSON.parse(raw)), workspaceRoot);
  } catch {
    return null;
  }
}

export type ConfigReadResult = { status: 'ok'; config: KanbrainConfig } | { status: 'missing' } | { status: 'invalid'; error: string };

export function readConfigWithDiagnostics(workspaceRoot: string): ConfigReadResult {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return { status: 'missing' };
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    const config = applyLocalOverlay(runMigrations(JSON.parse(raw)), workspaceRoot);
    return { status: 'ok', config };
  } catch (error) {
    return { status: 'invalid', error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeConfig(workspaceRoot: string, config: KanbrainConfig): void {
  const configPath = getConfigPath(workspaceRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const { repositories, showAssignedTo, selectedProfileId, ...shared } = config;
  fs.writeFileSync(configPath, `${JSON.stringify(shared, null, 2)}\n`, 'utf-8');

  const local = extractLocalFields(config);
  if (Object.keys(local).length > 0) {
    writeLocalConfig(workspaceRoot, local);
  }
}

export function ensureGitignoreEntry(workspaceRoot: string, entry: string): void {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const lines = content.split(/\r?\n/);
  if (lines.includes(entry)) {
    return;
  }
  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gitignorePath, `${prefix}${entry}\n`, 'utf-8');
}
