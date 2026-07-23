import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function checkoutBranch(workspaceRoot: string, branchName: string): Promise<void> {
  await execFileAsync('git', ['fetch'], { cwd: workspaceRoot });
  await execFileAsync('git', ['checkout', branchName], { cwd: workspaceRoot });
}
