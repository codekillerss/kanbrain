export const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

export type GetSessionFn = (
  scopes: string[],
  options: { createIfNone: boolean; clearSessionPreference?: boolean },
) => Promise<{ accessToken: string } | undefined>;

export async function ensureAzureSession(getSession: GetSessionFn): Promise<string> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true });
  if (!session) {
    throw new Error('Microsoft login was cancelled or failed.');
  }
  return session.accessToken;
}

export async function hasCachedAzureSession(getSession: GetSessionFn): Promise<boolean> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: false });
  return !!session;
}

export async function connectAzureSession(getSession: GetSessionFn): Promise<string> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true, clearSessionPreference: true });
  if (!session) {
    throw new Error('Microsoft login was cancelled or failed.');
  }
  return session.accessToken;
}
