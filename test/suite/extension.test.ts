import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Kanbrain Extension', () => {
  test('activates and registers its commands', async () => {
    const extension = vscode.extensions.getExtension('kanbrain.kanbrain');
    assert.ok(extension, 'extension not found — check publisher/name in package.json');
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kanbrain.setup'), 'kanbrain.setup not registered');
    assert.ok(commands.includes('kanbrain.selectWorkItem'), 'kanbrain.selectWorkItem not registered');
  });
});
