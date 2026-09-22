export function resolveAiProviderCommand(projectCommand: string | undefined, defaultCommand: string | undefined): string | undefined {
  return projectCommand !== undefined ? projectCommand : defaultCommand;
}
