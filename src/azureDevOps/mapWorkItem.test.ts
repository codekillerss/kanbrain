import { describe, it, expect } from 'vitest';
import { mapWorkItem, parseDevelopmentLink, type RawWorkItem } from './mapWorkItem';

function raw(overrides: Partial<RawWorkItem> = {}): RawWorkItem {
  return {
    id: 482,
    fields: {
      'System.Title': 'Fix bug in login',
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.Description': '<div>Description <b>with</b> html&nbsp;here</div>',
    },
    relations: [],
    ...overrides,
  };
}

describe('mapWorkItem', () => {
  it('maps basic fields', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.id).toBe(482);
    expect(item.title).toBe('Fix bug in login');
    expect(item.status).toBe('Active');
    expect(item.type).toBe('Task');
  });

  it('strips HTML from the description', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.description).toBe('Description with html here');
  });

  it('builds the work item URL from organization and project', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.url).toBe('https://dev.azure.com/my-org/MyProject/_workitems/edit/482');
  });

  it('has no parentId when there is no Hierarchy-Reverse relation', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.parentId).toBeNull();
  });

  it('extracts parentId from a Hierarchy-Reverse relation', () => {
    const item = mapWorkItem(
      raw({ relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/90' }] }),
      'my-org',
      'MyProject',
    );
    expect(item.parentId).toBe(90);
  });

  it('extracts childIds from Hierarchy-Forward relations', () => {
    const item = mapWorkItem(
      raw({
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/101' },
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/102' },
          { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/999' },
        ],
      }),
      'my-org',
      'MyProject',
    );
    expect(item.childIds).toEqual([101, 102]);
  });

  it('defaults missing fields to empty strings', () => {
    const item = mapWorkItem(raw({ fields: {} }), 'my-org', 'MyProject');
    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.status).toBe('');
    expect(item.type).toBe('');
  });

  it('maps System.AssignedTo into assignedTo using the imageUrl field', () => {
    const item = mapWorkItem(
      raw({
        fields: { ...raw().fields, 'System.AssignedTo': { displayName: 'Jane Doe', imageUrl: 'https://dev.azure.com/avatar/jane' } },
      }),
      'my-org',
      'MyProject',
    );
    expect(item.assignedTo).toEqual({ displayName: 'Jane Doe', imageUrl: 'https://dev.azure.com/avatar/jane' });
  });

  it('falls back to _links.avatar.href when imageUrl is not present', () => {
    const item = mapWorkItem(
      raw({
        fields: {
          ...raw().fields,
          'System.AssignedTo': { displayName: 'Jane Doe', _links: { avatar: { href: 'https://dev.azure.com/avatar/jane-link' } } },
        },
      }),
      'my-org',
      'MyProject',
    );
    expect(item.assignedTo).toEqual({ displayName: 'Jane Doe', imageUrl: 'https://dev.azure.com/avatar/jane-link' });
  });

  it('has a null imageUrl when neither imageUrl nor _links.avatar.href is present', () => {
    const item = mapWorkItem(
      raw({ fields: { ...raw().fields, 'System.AssignedTo': { displayName: 'Jane Doe' } } }),
      'my-org',
      'MyProject',
    );
    expect(item.assignedTo).toEqual({ displayName: 'Jane Doe', imageUrl: null });
  });

  it('has a null assignedTo when System.AssignedTo is missing', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.assignedTo).toBeNull();
  });
});

describe('parseDevelopmentLink', () => {
  it('parses a pull request ArtifactLink', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/PullRequestId/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/57',
      attributes: { name: 'Pull Request' },
    });
    expect(link).toEqual({ kind: 'pullRequest', repositoryId: '22222222-2222-2222-2222-222222222222', pullRequestId: 57 });
  });

  it('parses a branch ArtifactLink, decoding a slash in the branch name', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/Ref/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/GBfeature%2Ffoo',
      attributes: { name: 'Branch' },
    });
    expect(link).toEqual({ kind: 'branch', repositoryId: '22222222-2222-2222-2222-222222222222', branchName: 'feature/foo' });
  });

  it('parses a pull request ArtifactLink using the real %2F-encoded separator format', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/PullRequestId/11111111-1111-1111-1111-111111111111%2f22222222-2222-2222-2222-222222222222%2f57',
      attributes: { name: 'Pull Request' },
    });
    expect(link).toEqual({ kind: 'pullRequest', repositoryId: '22222222-2222-2222-2222-222222222222', pullRequestId: 57 });
  });

  it('parses a branch ArtifactLink using the real %2F-encoded separator format', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/Ref/11111111-1111-1111-1111-111111111111%2F22222222-2222-2222-2222-222222222222%2FGBfeature%2Ffoo',
      attributes: { name: 'Branch' },
    });
    expect(link).toEqual({ kind: 'branch', repositoryId: '22222222-2222-2222-2222-222222222222', branchName: 'feature/foo' });
  });

  it('returns null for an ArtifactLink that is neither a branch nor a pull request', () => {
    const link = parseDevelopmentLink({
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/Commit/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/abc123',
      attributes: { name: 'Fixed in Commit' },
    });
    expect(link).toBeNull();
  });

  it('returns null for a malformed url that does not match either pattern', () => {
    const link = parseDevelopmentLink({ rel: 'ArtifactLink', url: 'not-a-vstfs-url' });
    expect(link).toBeNull();
  });
});

describe("mapWorkItem's development field", () => {
  it('populates development from ArtifactLink relations, ignoring Hierarchy relations', () => {
    const item = mapWorkItem(
      raw({
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/my-org/_apis/wit/workItems/101' },
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/57',
            attributes: { name: 'Pull Request' },
          },
        ],
      }),
      'my-org',
      'MyProject',
    );
    expect(item.development).toEqual([
      { kind: 'pullRequest', repositoryId: '22222222-2222-2222-2222-222222222222', pullRequestId: 57 },
    ]);
  });

  it('defaults to an empty array when there are no ArtifactLink relations', () => {
    const item = mapWorkItem(raw(), 'my-org', 'MyProject');
    expect(item.development).toEqual([]);
  });
});
