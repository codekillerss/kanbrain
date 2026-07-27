import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, RepositoryPathEntry } from '../types';
import { runMigrations } from './migrations';

interface LocalConfig {
  repositories?: Record<string, RepositoryPathEntry>;
  showAssignedTo?: boolean;
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
// isn't bumped by every write path) so it runs exactly once per workspace, regardless of which command
// triggers the first read after upgrading.
function migrateLegacyLocalFields(config: KanbrainConfig, workspaceRoot: string): void {
  if (fs.existsSync(getConfigLocalPath(workspaceRoot))) {
    return;
  }
  const local = extractLocalFields(config);
  if (Object.keys(local).length === 0) {
    return;
  }
  writeLocalConfig(workspaceRoot, local);
}

function applyLocalOverlay(config: KanbrainConfig, workspaceRoot: string): KanbrainConfig {
  migrateLegacyLocalFields(config, workspaceRoot);
  const local = readLocalConfig(workspaceRoot);
  const result = { ...config };
  if ('repositories' in local) {
    result.repositories = local.repositories;
  }
  if ('showAssignedTo' in local) {
    result.showAssignedTo = local.showAssignedTo;
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

  const { repositories, showAssignedTo, ...shared } = config;
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
