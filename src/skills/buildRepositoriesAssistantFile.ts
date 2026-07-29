import type { RepositoryPathEntry } from '../types';

export function buildRepositoriesAssistantContent(
  organization: string,
  project: string,
  repositories: Record<string, RepositoryPathEntry>,
): string {
  const entries = Object.entries(repositories);
  const matched = entries.filter(([, entry]) => entry.path);
  const missing = entries.filter(([, entry]) => !entry.path);

  const matchedLines = matched.length
    ? matched.map(([id, entry]) => `- **${entry.name}** (id: \`${id}\`) → \`${entry.path}\``).join('\n')
    : '_None found locally._';
  const missingLines = missing.length
    ? missing.map(([id, entry]) => `- **${entry.name}** (id: \`${id}\`)`).join('\n')
    : '_None — every repository is already mapped to a local folder._';

  return `# Kanbrain Repositories Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## Scope

This file is scoped to **repositories only** — don't touch \`.kanbrain/config.json\`'s \`skills\`, \`globalSkills\`, or \`profiles\` while following it.

## Repositories found locally

${matchedLines}

## Repositories NOT found locally

${missingLines}

## What to do

1. For every repository listed under "Repositories found locally", make sure \`.kanbrain/config.json\`'s \`repositories\` entry for that id has \`path\` set to the local folder shown above (it likely already is — this file was generated from the same detection Kanbrain's Sync command uses).
2. For every repository listed under "Repositories NOT found locally", tell the user it isn't cloned anywhere Kanbrain could find and suggest they clone it — either with the "Clone" button on the Repositories segment of the Brain page, or manually. Do not run \`git clone\` yourself.
3. Don't rename, add, or remove repository entries — the list comes from the real Azure DevOps project, refreshed by Kanbrain: Sync Board Configuration.
`;
}
