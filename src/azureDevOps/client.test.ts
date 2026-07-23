import { describe, it, expect, vi } from 'vitest';
import { AzureDevOpsClient } from './client';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', text: async () => body, json: async () => JSON.parse(body) } as Response;
}

function binaryResponse(bytes: Uint8Array, contentType: string | null, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => bytes.buffer,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}

describe('AzureDevOpsClient', () => {
  it('lists organizations for the current user', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1' }))
      .mockResolvedValueOnce(jsonResponse({ value: [{ accountId: 'a1', accountName: 'my-org' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const orgs = await client.listOrganizations();

    expect(orgs).toEqual([{ id: 'a1', name: 'my-org' }]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://app.vssps.visualstudio.com/_apis/accounts?memberId=user-1&api-version=7.1',
      expect.anything(),
    );
  });

  it('lists projects for an organization', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ value: [{ id: 'p1', name: 'MyProject' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const projects = await client.listProjects('my-org');

    expect(projects).toEqual([{ id: 'p1', name: 'MyProject' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects?api-version=7.1',
      expect.anything(),
    );
  });

  it('searches work items and returns matched IDs', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 1 }, { id: 2 }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const ids = await client.searchWorkItems('my-org', 'MyProject', 'login');

    expect(ids).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql?api-version=7.1&$top=50',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('counts work items by type without fetching full details', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const count = await client.countWorkItemsByType('my-org', 'MyProject', ['Epic']);

    expect(count).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql?api-version=7.1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 0 without calling fetch when types is empty', async () => {
    const fetchImpl = vi.fn();
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const count = await client.countWorkItemsByType('my-org', 'MyProject', []);

    expect(count).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns an empty array from getWorkItems without calling fetch when ids is empty', async () => {
    const fetchImpl = vi.fn();
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const items = await client.getWorkItems('my-org', 'MyProject', []);

    expect(items).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches and maps work items by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 482, fields: { 'System.Title': 'Bug', 'System.State': 'Active', 'System.WorkItemType': 'Task' }, relations: [] },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const items = await client.getWorkItems('my-org', 'MyProject', [482]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(482);
    expect(items[0].title).toBe('Bug');
  });

  it('throws when the response is not ok, including the response body for diagnostics', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'TF51005: invalid query' }, false, 400));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await expect(client.listProjects('my-org')).rejects.toThrow(/400.*TF51005/s);
  });

  it('throws an AzureDevOpsHttpError carrying the response status when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'no access' }, false, 403));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await expect(client.listProjects('my-org')).rejects.toMatchObject({ status: 403 });
  });

  it('getChildren fetches work items for a parent childIds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: 101, fields: { 'System.Title': 'Sub', 'System.State': 'New', 'System.WorkItemType': 'Task' }, relations: [] }],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101], assignedTo: null, development: [] };

    const children = await client.getChildren('my-org', 'MyProject', parent);

    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(101);
  });

  it("gets the project's default team name", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ id: 'p1', name: 'MyProject', defaultTeam: { id: 't1', name: 'MyProject Team' } }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const team = await client.getDefaultTeamName('my-org', 'MyProject');

    expect(team).toBe('MyProject Team');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects/MyProject?api-version=7.1',
      expect.anything(),
    );
  });

  it('lists states for a work item type', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { name: 'New', category: 'Proposed', color: 'b2b2b2' },
          { name: 'Done', category: 'Completed', color: '339933' },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const states = await client.listWorkItemTypeStates('my-org', 'MyProject', 'User Story');

    expect(states).toEqual([
      { name: 'New', category: 'Proposed', color: 'b2b2b2' },
      { name: 'Done', category: 'Completed', color: '339933' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes/User%20Story/states?api-version=7.1',
      expect.anything(),
    );
  });

  it('lists boards for a team', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ value: [{ id: 'b1', name: 'MyProject Team Board' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const boards = await client.listBoards('my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([{ id: 'b1', name: 'MyProject Team Board' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/boards?api-version=7.1',
      expect.anything(),
    );
  });

  it('lists columns for a board, including state mappings by work item type', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed', Bug: 'Active' } }],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const columns = await client.listBoardColumns('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(columns).toEqual([
      { name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed', Bug: 'Active' } },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/boards/b1/columns?api-version=7.1',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.getAvatarDataUri', () => {
  it('fetches the avatar with auth and returns a base64 data URI using the response content-type', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(bytes, 'image/png'));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const dataUri = await client.getAvatarDataUri('https://dev.azure.com/my-org/_apis/GraphProfile/MemberAvatars/abc');

    expect(dataUri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/GraphProfile/MemberAvatars/abc',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
  });

  it('defaults to image/png when the response has no content-type header', async () => {
    const bytes = new Uint8Array([9, 9]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(bytes, null));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const dataUri = await client.getAvatarDataUri('https://example.com/avatar');

    expect(dataUri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  });

  it('returns null when the fetch fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'nope' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const dataUri = await client.getAvatarDataUri('https://example.com/avatar');

    expect(dataUri).toBeNull();
  });
});

describe('AzureDevOpsClient.getWorkItemTypeLayout', () => {
  it('fetches and returns the work item type layout', async () => {
    const layout = {
      pages: [{ sections: [{ groups: [{ controls: [{ id: 'System.State', label: 'State', controlType: 'FieldControl' }] }] }] }],
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(layout));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const result = await client.getWorkItemTypeLayout('my-org', 'MyProject', 'Bug');

    expect(result).toEqual(layout);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes/Bug/layout?api-version=7.1-preview.1',
      expect.anything(),
    );
  });

  it('returns null when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'nope' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const result = await client.getWorkItemTypeLayout('my-org', 'MyProject', 'Bug');

    expect(result).toBeNull();
  });
});

describe('AzureDevOpsClient.getWorkItemRawFields', () => {
  it('fetches and returns the raw fields for a single work item', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 482, fields: { 'System.Title': 'Bug', 'System.Tags': 'a; b' } }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const fields = await client.getWorkItemRawFields('my-org', 'MyProject', 482);

    expect(fields).toEqual({ 'System.Title': 'Bug', 'System.Tags': 'a; b' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitems/482?api-version=7.1',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.getComments', () => {
  it('maps comments from the "comments" response shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        comments: [
          {
            id: 1,
            text: '<p>First</p>',
            createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' },
            createdDate: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments).toEqual([
      {
        id: 1,
        text: '<p>First</p>',
        createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' },
        createdDate: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workItems/482/comments?api-version=7.1-preview.3',
      expect.anything(),
    );
  });

  it('falls back to the "value" response shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ value: [{ id: 2, text: 'Second', createdBy: { displayName: 'Bob' }, createdDate: '2026-01-02T00:00:00Z' }] }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments).toEqual([{ id: 2, text: 'Second', createdBy: { displayName: 'Bob', imageUrl: null }, createdDate: '2026-01-02T00:00:00Z' }]);
  });

  it('sorts comments chronologically by createdDate', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        comments: [
          { id: 2, text: 'Second', createdBy: { displayName: 'Bob' }, createdDate: '2026-01-02T00:00:00Z' },
          { id: 1, text: 'First', createdBy: { displayName: 'Jane' }, createdDate: '2026-01-01T00:00:00Z' },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments.map(c => c.id)).toEqual([1, 2]);
  });

  it('defaults createdBy to Unknown with no imageUrl when missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ comments: [{ id: 1, text: '', createdDate: '2026-01-01T00:00:00Z' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getComments('my-org', 'MyProject', 482);

    expect(comments[0].createdBy).toEqual({ displayName: 'Unknown', imageUrl: null });
  });
});

describe('AzureDevOpsClient.getPullRequestThreadComments', () => {
  it('flattens comments from all threads, keeping only real user text comments', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            comments: [
              {
                id: 1,
                content: 'Normal Paulk voted 10',
                author: { displayName: 'Service Account' },
                publishedDate: '2026-01-01T00:00:00Z',
                commentType: 'system',
              },
            ],
          },
          {
            comments: [
              {
                id: 1,
                content: 'This looks good!',
                author: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' },
                publishedDate: '2026-01-02T00:00:00Z',
                commentType: 'text',
              },
            ],
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getPullRequestThreadComments('my-org', 'MyProject', 'repo-1', 57);

    expect(comments).toEqual([
      { id: 1, text: 'This looks good!', createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' }, createdDate: '2026-01-02T00:00:00Z' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/repositories/repo-1/pullRequests/57/threads?api-version=7.1',
      expect.anything(),
    );
  });

  it('excludes deleted comments', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            comments: [
              { id: 1, content: 'Deleted', author: { displayName: 'Jane' }, publishedDate: '2026-01-01T00:00:00Z', commentType: 'text', isDeleted: true },
            ],
          },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getPullRequestThreadComments('my-org', 'MyProject', 'repo-1', 57);

    expect(comments).toEqual([]);
  });

  it('sorts comments chronologically across threads', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { comments: [{ id: 1, content: 'Second', author: { displayName: 'Bob' }, publishedDate: '2026-01-02T00:00:00Z', commentType: 'text' }] },
          { comments: [{ id: 1, content: 'First', author: { displayName: 'Jane' }, publishedDate: '2026-01-01T00:00:00Z', commentType: 'text' }] },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const comments = await client.getPullRequestThreadComments('my-org', 'MyProject', 'repo-1', 57);

    expect(comments.map(c => c.text)).toEqual(['First', 'Second']);
  });
});

describe('AzureDevOpsClient.getCardSettings', () => {
  it('maps each work item type to whether Parent and AssignedTo field identifiers are present', async () => {
    // Real shape (confirmed against the documented card-fields payload): cards[type] is a flat
    // array of field entries, not an object with a `.fields` property.
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        cards: {
          'User Story': [
            { fieldIdentifier: 'System.Title' },
            { fieldIdentifier: 'System.Parent' },
            { fieldIdentifier: 'System.AssignedTo', displayFormat: 'AvatarOnly', displayType: 'CORE' },
          ],
          Bug: [{ fieldIdentifier: 'System.Title' }, { fieldIdentifier: 'System.Tags' }, { showEmptyFields: 'false' }],
        },
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({
      'User Story': { parent: true, assignedTo: true },
      Bug: { parent: false, assignedTo: false },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/boards/b1/cardsettings?api-version=7.1',
      expect.anything(),
    );
  });

  it('returns an empty object when the response has no cards', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({});
  });

  it('treats a type with an empty fields array as neither Parent nor AssignedTo shown', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ cards: { Task: [] } }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({ Task: { parent: false, assignedTo: false } });
  });

  it('ignores entries without a fieldIdentifier, like the trailing showEmptyFields entry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ cards: { Task: [{ fieldIdentifier: 'System.Parent' }, { showEmptyFields: 'true' }] } }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({ Task: { parent: true, assignedTo: false } });
  });
});

describe('AzureDevOpsClient.getTaskBacklogWorkItemTypes', () => {
  it('extracts the work item type names from taskBacklog.workItemTypes', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ taskBacklog: { workItemTypes: [{ name: 'Task' }, { name: 'Bug' }] } }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.getTaskBacklogWorkItemTypes('my-org', 'MyProject', 'MyProject Team');

    expect(types).toEqual(['Task', 'Bug']);
  });

  it('returns an empty array when the response has no taskBacklog', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.getTaskBacklogWorkItemTypes('my-org', 'MyProject', 'MyProject Team');

    expect(types).toEqual([]);
  });
});

describe('AzureDevOpsClient.getPullRequest', () => {
  it('fetches and maps a pull request title and status', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ title: 'Fix login bug', status: 'active' }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequest('my-org', 'MyProject', 'repo-1', 57);

    expect(pr).toEqual({ title: 'Fix login bug', status: 'active' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/repositories/repo-1/pullrequests/57?api-version=7.1',
      expect.anything(),
    );
  });

  it('returns null when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'not found' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequest('my-org', 'MyProject', 'repo-1', 57);

    expect(pr).toBeNull();
  });
});

describe('AzureDevOpsClient.getRepository', () => {
  it('fetches and maps the repository name', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ name: 'kanbrain' }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const repo = await client.getRepository('my-org', 'MyProject', 'repo-1');

    expect(repo).toEqual({ name: 'kanbrain' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/repositories/repo-1?api-version=7.1',
      expect.anything(),
    );
  });

  it('returns null when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'not found' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const repo = await client.getRepository('my-org', 'MyProject', 'repo-1');

    expect(repo).toBeNull();
  });
});

describe('AzureDevOpsClient.getPullRequestDetail', () => {
  it('maps the full pull request payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        pullRequestId: 57,
        title: 'Fix login bug',
        description: 'Fixes the thing.\nSecond line.',
        status: 'active',
        isDraft: false,
        sourceRefName: 'refs/heads/feature/login-fix',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'Jane Doe', imageUrl: 'https://example.com/jane.png' },
        reviewers: [{ displayName: 'Bob', imageUrl: 'https://example.com/bob.png', vote: 10, isRequired: true }],
        workItemRefs: [{ id: '482' }, { id: '900' }],
        repository: { webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain' },
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequestDetail('my-org', 'MyProject', 'repo-1', 57);

    expect(pr).toEqual({
      id: 57,
      title: 'Fix login bug',
      description: 'Fixes the thing.\nSecond line.',
      status: 'active',
      isDraft: false,
      sourceBranch: 'feature/login-fix',
      targetBranch: 'main',
      createdBy: { displayName: 'Jane Doe', imageUrl: 'https://example.com/jane.png' },
      reviewers: [{ displayName: 'Bob', imageUrl: 'https://example.com/bob.png', vote: 10, isRequired: true }],
      workItemIds: [482, 900],
      webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain/pullrequest/57',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/git/repositories/repo-1/pullrequests/57?includeWorkItemRefs=true&api-version=7.1',
      expect.anything(),
    );
  });

  it('defaults missing description, reviewers, and workItemRefs to empty values', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        pullRequestId: 57,
        title: 'Fix login bug',
        status: 'active',
        isDraft: false,
        sourceRefName: 'refs/heads/feature/x',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'Jane Doe' },
        repository: { webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain' },
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequestDetail('my-org', 'MyProject', 'repo-1', 57);

    expect(pr?.description).toBe('');
    expect(pr?.reviewers).toEqual([]);
    expect(pr?.workItemIds).toEqual([]);
    expect(pr?.createdBy).toEqual({ displayName: 'Jane Doe', imageUrl: null });
  });

  it('returns null when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'not found' }, false, 404));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const pr = await client.getPullRequestDetail('my-org', 'MyProject', 'repo-1', 57);

    expect(pr).toBeNull();
  });
});

describe('AzureDevOpsClient.listWorkItemTypes', () => {
  it('maps name/color/icon.url, skipping disabled types and types without an icon', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { name: 'Bug', color: 'CC293D', icon: { url: 'https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect' }, isDisabled: false },
          { name: 'Old Type', color: '000000', icon: { url: 'https://example.com/icon' }, isDisabled: true },
          { name: 'No Icon Type', color: '000000', isDisabled: false },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.listWorkItemTypes('my-org', 'MyProject');

    expect(types).toEqual([
      { name: 'Bug', color: 'CC293D', iconUrl: 'https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes?api-version=7.1',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.getIconSvg', () => {
  it('fetches the raw svg text from the given icon url', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(textResponse('<svg><path d="M0 0"/></svg>'));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const svg = await client.getIconSvg('https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect');

    expect(svg).toBe('<svg><path d="M0 0"/></svg>');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.listTeams', () => {
  it('maps id/name for every team in the project', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 't1', name: 'Team 1' },
          { id: 't2', name: 'Team 2' },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const teams = await client.listTeams('my-org', 'MyProject');

    expect(teams).toEqual([
      { id: 't1', name: 'Team 1' },
      { id: 't2', name: 'Team 2' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects/MyProject/teams?api-version=7.1',
      expect.anything(),
    );
  });
});
