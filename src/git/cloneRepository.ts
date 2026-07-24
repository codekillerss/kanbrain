import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

export async function cloneRepository(parentDir: string, cloneUrl: string, repoName: string): Promise<string> {
  const destination = path.join(parentDir, repoName);
  await execFileAsync('git', ['clone', cloneUrl, destination]);
  return destination;
}
