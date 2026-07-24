export function extractRepoNameFromRemoteUrl(remoteUrl: string): string | null {
  const lastSegment = decodeURIComponent(remoteUrl.trim())
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .split(/[/:]/)
    .pop();
  return lastSegment || null;
}
