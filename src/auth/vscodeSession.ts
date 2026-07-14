import * as vscode from 'vscode';
import type { GetSessionFn } from './ensureAzureSession';

export const getVscodeMicrosoftSession: GetSessionFn = async (scopes, options) => {
  const session = await vscode.authentication.getSession('microsoft', scopes, options);
  return session;
};
