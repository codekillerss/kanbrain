import type { AzureDevOpsClient } from './client';
import { sanitizeSvg } from '../view/sanitizeSvg';

export interface DiscoveredWorkItemType {
  name: string;
  color: string;
  iconSvg: string;
  states: { name: string; category: string; color: string }[];
}

export async function discoverWorkItemTypes(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<DiscoveredWorkItemType[]> {
  const types = await client.listWorkItemTypes(organization, project);
  const result: DiscoveredWorkItemType[] = [];

  for (const type of types) {
    try {
      const [states, iconSvgRaw] = await Promise.all([
        client.listWorkItemTypeStates(organization, project, type.name),
        client.getIconSvg(type.iconUrl),
      ]);
      result.push({ name: type.name, color: type.color, iconSvg: sanitizeSvg(iconSvgRaw), states });
    } catch {
      // One-off failure for a type: continue without it instead of aborting the whole discovery.
    }
  }

  return result;
}

export function discoverStatusesByType(types: DiscoveredWorkItemType[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const type of types) {
    const statuses: Record<string, string> = {};
    for (const state of type.states) {
      statuses[state.name] = state.category;
    }
    if (Object.keys(statuses).length > 0) {
      result[type.name] = statuses;
    }
  }
  return result;
}

export function discoverStatusColors(types: DiscoveredWorkItemType[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const type of types) {
    for (const state of type.states) {
      if (!(state.name in colors)) {
        colors[state.name] = state.color;
      }
    }
  }
  return colors;
}
