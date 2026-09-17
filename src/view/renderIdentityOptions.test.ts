import { describe, it, expect } from 'vitest';
import { renderIdentityOptions } from './renderIdentityOptions';
import type { IdentitySearchResult } from '../azureDevOps/client';

describe('renderIdentityOptions', () => {
  it('shows a "No matches." message for an empty result list', () => {
    expect(renderIdentityOptions([], 482)).toContain('No matches.');
  });

  it('renders one button per result with the work item id, unique name, and display name', () => {
    const results: IdentitySearchResult[] = [{ id: 'id-1', displayName: 'Jane Doe', uniqueName: 'jane@example.com' }];

    const html = renderIdentityOptions(results, 482);

    expect(html).toContain('data-action="select-assignee"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('data-unique-name="jane@example.com"');
    expect(html).toContain('data-display-name="Jane Doe"');
    expect(html).toContain('>Jane Doe<');
  });

  it('escapes HTML in the display name', () => {
    const results: IdentitySearchResult[] = [{ id: 'id-1', displayName: '<script>Bad</script>', uniqueName: 'bad@example.com' }];

    const html = renderIdentityOptions(results, 482);

    expect(html).not.toContain('<script>Bad</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
