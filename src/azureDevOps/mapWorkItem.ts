import type { WorkItem, AssignedTo, DevelopmentLink } from '../types';

export interface RawRelation {
  rel: string;
  url: string;
  attributes?: { name?: string };
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

// Azure DevOps encodes the artifact ID (projectId/repositoryId/PR-or-ref) as a single opaque
// segment, joined with %2F rather than literal slashes — support both forms defensively.
const SEP = '(?:/|%2[Ff])';
const PULL_REQUEST_URL = new RegExp(`^vstfs:///Git/PullRequestId/[^/%]+${SEP}([^/%]+)${SEP}(\\d+)$`);
const BRANCH_URL = new RegExp(`^vstfs:///Git/Ref/[^/%]+${SEP}([^/%]+)${SEP}GB(.+)$`);

export function parseDevelopmentLink(relation: RawRelation): DevelopmentLink | null {
  const prMatch = relation.url.match(PULL_REQUEST_URL);
  if (prMatch) {
    return { kind: 'pullRequest', repositoryId: prMatch[1], pullRequestId: Number(prMatch[2]) };
  }
  const branchMatch = relation.url.match(BRANCH_URL);
  if (branchMatch) {
    return { kind: 'branch', repositoryId: branchMatch[1], branchName: decodeURIComponent(branchMatch[2]) };
  }
  return null;
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
  const development = relations
    .filter(r => r.rel === 'ArtifactLink')
    .map(parseDevelopmentLink)
    .filter((link): link is DevelopmentLink => link !== null);

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
    development,
  };
}
