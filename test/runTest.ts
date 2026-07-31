import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    // activate() only registers commands when a workspace folder is open, so the
    // test instance has to be launched against one.
    const workspacePath = path.resolve(extensionDevelopmentPath, 'test/fixtures/empty-workspace');
    // Pinned to the oldest VS Code this extension supports (engines.vscode), so the run is
    // deterministic and actually verifies that promise. Left unpinned, the suite downloads
    // whatever is stable that week - which also breaks @vscode/test-electron 2.x, since it
    // spawns Contents/MacOS/Electron and current VS Code no longer ships that binary.
    await runTests({ version: '1.85.0', extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspacePath] });
  } catch (err) {
    console.error('Falha ao rodar os testes de integração', err);
    process.exit(1);
  }
}

void main();
