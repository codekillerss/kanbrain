import type { WorkItem, AssignedTo } from '../types';

export interface RawRelation {
  rel: string;
  url: string;
}

export interface RawWorkItem {
  id: number;
  fields: Record<string, unknown>;
  relations?: RawRelation[];
}

interface RawIdentityRef {
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIdFromUrl(url: string): number {
  const match = url.match(/\/(\d+)$/);
  if (!match) {
    throw new Error(`Could not extract the work item ID from the URL: ${url}`);
  }
  return Number(match[1]);
}

function mapAssignedTo(raw: unknown): AssignedTo | null {
  const identity = raw as RawIdentityRef | undefined;
  if (!identity?.displayName) {
    return null;
  }
  const imageUrl = identity.imageUrl ?? identity._links?.avatar?.href ?? null;
  return { displayName: identity.displayName, imageUrl };
}

export function mapWorkItem(raw: RawWorkItem, organization: string, project: string): WorkItem {
  const relations = raw.relations ?? [];
  const parentRelation = relations.find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  const childRelations = relations.filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward');

  return {
    id: raw.id,
    title: String(raw.fields['System.Title'] ?? ''),
    description: stripHtml(String(raw.fields['System.Description'] ?? '')),
    status: String(raw.fields['System.State'] ?? ''),
    type: String(raw.fields['System.WorkItemType'] ?? ''),
    url: `https://dev.azure.com/${organization}/${project}/_workitems/edit/${raw.id}`,
    parentId: parentRelation ? extractIdFromUrl(parentRelation.url) : null,
    childIds: childRelations.map(r => extractIdFromUrl(r.url)),
    assignedTo: mapAssignedTo(raw.fields['System.AssignedTo']),
  };
}
