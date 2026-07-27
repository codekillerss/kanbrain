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

function applyLocalOverlay(config: KanbrainConfig, workspaceRoot: string): KanbrainConfig {
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

  const local: LocalConfig = {};
  if (repositories !== undefined) {
    local.repositories = repositories;
  }
  if (showAssignedTo !== undefined) {
    local.showAssignedTo = showAssignedTo;
  }
  if (Object.keys(local).length > 0) {
    fs.writeFileSync(getConfigLocalPath(workspaceRoot), `${JSON.stringify(local, null, 2)}\n`, 'utf-8');
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
