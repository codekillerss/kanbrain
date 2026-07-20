import { describe, it, expect } from 'vitest';
import { renderAssigneeRow } from './renderAssignee';

describe('renderAssigneeRow', () => {
  it('shows "Unassigned" with a placeholder badge when there is no assignee', () => {
    const html = renderAssigneeRow(null, {}, 'kb-assignee-row');

    expect(html).toContain('kb-assignee-row');
    expect(html).toContain('Unassigned');
    expect(html).toContain('kb-avatar-initial');
  });

  it('shows an initial badge with the first letter of the name when no avatar is resolved', () => {
    const html = renderAssigneeRow({ displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' }, {}, 'kb-assignee-row');

    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>J<');
    expect(html).toContain('Jane Doe');
    expect(html).not.toContain('<img');
  });

  it('shows the resolved avatar image when a data URI is available for the imageUrl', () => {
    const avatars = { 'https://example.com/avatar.png': 'data:image/png;base64,ABC123' };
    const html = renderAssigneeRow({ displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' }, avatars, 'kb-assignee-row');

    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,ABC123"');
    expect(html).not.toContain('kb-avatar-initial');
  });

  it('shows an initial badge when the assignee has no imageUrl at all', () => {
    const html = renderAssigneeRow({ displayName: 'Bob', imageUrl: null }, {}, 'kb-assignee-row');

    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>B<');
  });

  it('escapes the display name', () => {
    const html = renderAssigneeRow({ displayName: '<script>', imageUrl: null }, {}, 'kb-assignee-row');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies the given row class so callers can style it differently', () => {
    const html = renderAssigneeRow(null, {}, 'kb-result-item-assignee');

    expect(html).toContain('kb-result-item-assignee');
  });
});
