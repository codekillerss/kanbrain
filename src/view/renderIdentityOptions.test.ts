import { describe, it, expect } from 'vitest';
import { renderIdentityOptions } from './renderIdentityOptions';
import type { IdentitySearchResult } from '../azureDevOps/client';

function identity(overrides: Partial<IdentitySearchResult> = {}): IdentitySearchResult {
  return { id: 'id-1', displayName: 'Jane Doe', uniqueName: 'jane@example.com', imageUrl: null, ...overrides };
}

describe('renderIdentityOptions', () => {
  it('shows a "No matches." message for an empty result list', () => {
    expect(renderIdentityOptions([], 482, {})).toContain('No matches.');
  });

  it('renders one button per result with the work item id, unique name, and display name', () => {
    const html = renderIdentityOptions([identity()], 482, {});

    expect(html).toContain('data-action="select-assignee"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('data-unique-name="jane@example.com"');
    expect(html).toContain('data-display-name="Jane Doe"');
    expect(html).toContain('Jane Doe');
  });

  it('escapes HTML in the display name', () => {
    const html = renderIdentityOptions([identity({ displayName: '<script>Bad</script>', uniqueName: 'bad@example.com' })], 482, {});

    expect(html).not.toContain('<script>Bad</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows the avatar before the name when the image has been resolved', () => {
    const results = [identity({ imageUrl: 'https://avatar.example/jane.png' })];
    const avatars = { 'https://avatar.example/jane.png': 'data:image/png;base64,AAA' };

    const html = renderIdentityOptions(results, 482, avatars);

    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,AAA"');
    expect(html.indexOf('<img')).toBeLessThan(html.lastIndexOf('Jane Doe'));
  });

  it('falls back to the initial when the identity has no image at all', () => {
    const html = renderIdentityOptions([identity()], 482, {});

    expect(html).toContain('<span class="kb-avatar-initial">J</span>');
    expect(html).not.toContain('<img');
  });

  it('falls back to the initial when the image url has not been resolved into a data uri', () => {
    const results = [identity({ imageUrl: 'https://avatar.example/jane.png' })];

    const html = renderIdentityOptions(results, 482, {});

    expect(html).toContain('kb-avatar-initial');
    expect(html).not.toContain('<img');
  });
});
