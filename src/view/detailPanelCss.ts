export function detailPanelCss(): string {
  return `
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px 24px; }
    .kb-detail-header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; margin-bottom: 16px; }
    .kb-detail-title-row { display: flex; align-items: center; gap: 8px; }
    .kb-detail-title-row .kb-type-icon { width: 22px; height: 22px; }
    .kb-type-icon { display: inline-flex; width: 14px; height: 14px; flex-shrink: 0; }
    .kb-type-icon svg { width: 100%; height: 100%; }
    .kb-detail-id { font-weight: 600; font-size: 16px; opacity: 0.75; flex-shrink: 0; }
    .kb-detail-title { font-size: 22px; margin: 0; }
    .kb-detail-status-row { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.75; margin-top: 6px; }
    .kb-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .kb-detail-assignee { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.9; }
    .kb-detail-body { display: flex; flex-wrap: wrap; gap: 24px; }
    .kb-detail-main { flex: 2 1 420px; min-width: 0; }
    .kb-detail-side { flex: 1 1 260px; min-width: 0; }
    .kb-detail-html-section { margin-bottom: 20px; }
    .kb-detail-section-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 8px; }
    .kb-detail-html-body { line-height: 1.5; }
    .kb-detail-html-body img { max-width: 100%; }
    .kb-detail-group { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin-bottom: 12px; }
    .kb-detail-group-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 8px; }
    .kb-detail-field { margin-bottom: 8px; }
    .kb-detail-field-label { font-size: 11px; opacity: 0.7; }
    .kb-detail-field-value { font-size: 13px; }
    .kb-related-subgroup-label { font-size: 11px; font-weight: 600; opacity: 0.7; margin: 8px 0 4px; }
    .kb-related-subgroup-label:first-child { margin-top: 0; }
    .kb-related-item { display: flex; align-items: center; gap: 4px; font-size: 13px; margin-bottom: 4px; color: inherit; text-decoration: none; cursor: pointer; }
    .kb-related-item:hover { color: var(--vscode-textLink-foreground); }
    .kb-related-id { font-weight: 600; flex-shrink: 0; }
    .kb-detail-tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 11px; }
    .kb-avatar { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
    .kb-avatar-initial { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 9px; flex-shrink: 0; }
    .kb-empty { opacity: 0.7; }
    .kb-comments { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
    .kb-comment { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; }
    .kb-comment-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; }
    .kb-comment-author { font-weight: 600; }
    .kb-comment-date { opacity: 0.7; }
    .kb-comment-body { line-height: 1.5; }
    .kb-dev-label { display: flex; align-items: center; gap: 4px; }
    .kb-dev-item { display: flex; align-items: center; gap: 4px; font-size: 12px; margin-top: 4px; opacity: 0.85; }
    a.kb-dev-item { cursor: pointer; text-decoration: none; color: inherit; }
    a.kb-dev-item:hover { color: var(--vscode-textLink-foreground); }
    .kb-dev-item svg { flex-shrink: 0; }
    .kb-dev-item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kb-dev-more-toggle { display: none; }
    .kb-dev-extra { display: none; }
    .kb-dev-more-toggle:checked + .kb-dev-extra { display: block; }
    .kb-dev-more-toggle:checked ~ .kb-dev-more-btn { display: none; }
    .kb-dev-more-btn { display: inline-block; margin-top: 4px; font-size: 12px; color: var(--vscode-textLink-foreground); cursor: pointer; }
    .kb-dev-more-btn:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
    .kb-pr-branches { font-size: 12px; opacity: 0.75; margin-top: 6px; }
    .kb-pr-web-link { display: inline-block; margin-top: 6px; font-size: 12px; color: var(--vscode-textLink-foreground); }
    .kb-pr-description { white-space: pre-wrap; }
    .kb-pr-reviewer { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 6px; }
    .kb-pr-vote { opacity: 0.75; font-size: 12px; }
    .kb-pr-required-tag { font-size: 10px; text-transform: uppercase; opacity: 0.6; }
  `;
}
