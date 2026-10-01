import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GENERATED_FILE_HEADER, writeGeneratedFile } from './writeGeneratedFile';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbrain-gen-'));
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('writeGeneratedFile', () => {
  it('creates the .kanbrain/generated directory if it does not exist', () => {
    writeGeneratedFile(workspaceRoot, 'note.md', 'hello');

    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain', 'generated'))).toBe(true);
  });

  it('writes the given content to the given file name, after the Kanbrain header', () => {
    writeGeneratedFile(workspaceRoot, 'note.md', 'hello world');

    const written = fs.readFileSync(path.join(workspaceRoot, '.kanbrain', 'generated', 'note.md'), 'utf-8');
    expect(written).toBe(`${GENERATED_FILE_HEADER}hello world`);
  });

  it('tells the agent what Kanbrain is and points it at the usage guide', () => {
    expect(GENERATED_FILE_HEADER).toContain('Kanbrain VS Code extension');
    expect(GENERATED_FILE_HEADER).toContain('`.kanbrain/USAGE.md`');
  });

  it('names both config files with their paths and what each holds', () => {
    expect(GENERATED_FILE_HEADER).toContain('`.kanbrain/config.json`');
    expect(GENERATED_FILE_HEADER).toContain('`.kanbrain/config.local.json`');
    expect(GENERATED_FILE_HEADER).toMatch(/config\.json`[^`]*skills/);
    expect(GENERATED_FILE_HEADER).toMatch(/config\.local\.json`[^`]*repository paths/);
  });

  it('separates the header from the content', () => {
    expect(GENERATED_FILE_HEADER.endsWith('\n\n---\n\n')).toBe(true);
  });

  it('returns the path relative to the workspace root', () => {
    const relativePath = writeGeneratedFile(workspaceRoot, 'note.md', 'hello');

    expect(relativePath).toBe(path.join('.kanbrain', 'generated', 'note.md'));
  });
});
