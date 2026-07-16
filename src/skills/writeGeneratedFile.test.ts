import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeGeneratedFile } from './writeGeneratedFile';

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

  it('writes the given content to the given file name', () => {
    writeGeneratedFile(workspaceRoot, 'note.md', 'hello world');

    const written = fs.readFileSync(path.join(workspaceRoot, '.kanbrain', 'generated', 'note.md'), 'utf-8');
    expect(written).toBe('hello world');
  });

  it('returns the path relative to the workspace root', () => {
    const relativePath = writeGeneratedFile(workspaceRoot, 'note.md', 'hello');

    expect(relativePath).toBe(path.join('.kanbrain', 'generated', 'note.md'));
  });
});
