// The sidebar runs scripts and can trigger terminal commands, so only the extension's own
// nonce-tagged <script> may execute — any markup that slips past escaping stays inert.
export function sidebarCsp(nonce: string): string {
  return `default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; script-src 'nonce-${nonce}';`;
}
