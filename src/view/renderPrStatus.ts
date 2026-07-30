const PR_STATUS_COLORS: Record<string, string> = {
  active: 'var(--vscode-charts-blue)',
  completed: 'var(--vscode-charts-green)',
  abandoned: 'var(--vscode-charts-red)',
};

export function renderPrStatusDot(status: string, isDraft: boolean): string {
  const color = isDraft ? 'var(--vscode-charts-yellow)' : (PR_STATUS_COLORS[status] ?? 'var(--vscode-charts-blue)');
  return `<span class="kb-status-dot" style="background-color: ${color}"></span>`;
}
