import { describe, it, expect } from 'vitest';
import { mapWorkItem, type RawWorkItem } from './mapWorkItem';

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
