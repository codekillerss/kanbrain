import * as fs from 'node:fs';
import * as path from 'node:path';

export function writeGeneratedFile(workspaceRoot: string, fileName: string, content: string): string {
  const generatedDir = path.join(workspaceRoot, '.kanbrain', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, fileName), content, 'utf-8');
  return path.join('.kanbrain', 'generated', fileName);
}
