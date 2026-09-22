export const AI_PROVIDER_PRESETS = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex CLI', command: 'codex' },
];

export function matchAiProviderPreset(command: string): (typeof AI_PROVIDER_PRESETS)[number] | undefined {
  return AI_PROVIDER_PRESETS.find(p => p.command === command);
}
