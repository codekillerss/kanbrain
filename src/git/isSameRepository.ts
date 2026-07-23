export function isSameRepository(repoName: string, localRemoteUrl: string | null): boolean | null {
  if (!localRemoteUrl) {
    return null;
  }
  const lastSegment = decodeURIComponent(localRemoteUrl.trim())
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .split(/[/:]/)
    .pop();
  return (lastSegment ?? '').toLowerCase() === repoName.toLowerCase();
}
