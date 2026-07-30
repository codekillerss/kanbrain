const PR_STATUS_COLORS: Record<string, string> = {
  active: 'var(--vscode-charts-blue)',
  completed: 'var(--vscode-charts-green)',
  abandoned: 'var(--vscode-charts-red)',
};

export function resolvePrStatusColor(status: string, isDraft: boolean): string {
  return isDraft ? 'var(--vscode-charts-yellow)' : (PR_STATUS_COLORS[status] ?? 'var(--vscode-charts-blue)');
}

export function renderPrStatusDot(status: string, isDraft: boolean): string {
  return `<span class="kb-status-dot" style="background-color: ${resolvePrStatusColor(status, isDraft)}"></span>`;
}
