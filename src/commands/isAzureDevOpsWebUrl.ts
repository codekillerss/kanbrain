// Command-URI arguments can be crafted by anyone who can edit work item HTML shown in a webview,
// so only ever hand an Azure DevOps https page to openExternal — never file:, vscode: or other hosts.
export function isAzureDevOpsWebUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') {
    return false;
  }
  return parsed.hostname === 'dev.azure.com' || parsed.hostname.endsWith('.visualstudio.com');
}
