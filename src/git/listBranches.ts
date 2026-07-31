import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function listLocalBranches(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], { cwd: workspaceRoot });
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch {
    return [];
  }
}
