export const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

export type GetSessionFn = (
  scopes: string[],
  options: { createIfNone: boolean },
) => Promise<{ accessToken: string } | undefined>;

export async function ensureAzureSession(getSession: GetSessionFn): Promise<string> {
  const session = await getSession([AZURE_DEVOPS_SCOPE], { createIfNone: true });
  if (!session) {
    throw new Error('Login com a Microsoft foi cancelado ou falhou.');
  }
  return session.accessToken;
}
