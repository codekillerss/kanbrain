import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getCurrentBranch(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: workspaceRoot });
    return stdout.trim();
  } catch {
    return '';
  }
}
