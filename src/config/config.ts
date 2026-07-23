import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig } from '../types';
import { runMigrations } from './migrations';

export function getConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.kanbrain', 'config.json');
}

export function readConfig(workspaceRoot: string): KanbrainConfig | null {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    return runMigrations(JSON.parse(raw));
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
    return { status: 'ok', config: runMigrations(JSON.parse(raw)) };
  } catch (error) {
    return { status: 'invalid', error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeConfig(workspaceRoot: string, config: KanbrainConfig): void {
  const configPath = getConfigPath(workspaceRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
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
