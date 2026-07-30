import { describe, it, expect } from 'vitest';
import { renderProfilesEditor } from './renderProfilesEditor';
import type { ProfileEntry } from '../types';

describe('renderProfilesEditor', () => {
  it('shows the Profiles header even when there are no profiles', () => {
    const html = renderProfilesEditor({});

    expect(html).toContain('Profiles');
  });

  it('renders one row per profile with data-profile-id and the label/description values', () => {
    const profiles: Record<string, ProfileEntry> = {
      developer: { label: 'Developer', description: 'I am a developer.' },
      qa: { label: 'QA', description: 'I am responsible for quality.' },
    };
    const html = renderProfilesEditor(profiles);

    expect(html).toContain('data-profile-id="developer"');
    expect(html).toContain('data-field="label" placeholder="Label" value="Developer"');
    expect(html).toContain('I am a developer.');
    expect(html).toContain('data-profile-id="qa"');
    expect(html).toContain('data-field="label" placeholder="Label" value="QA"');
    expect(html).toContain('I am responsible for quality.');
  });

  it('shows "New profile" as the collapsed header when label is empty', () => {
    const html = renderProfilesEditor({ 'profile-1': { label: '', description: '' } });
    expect(html).toContain('New profile');
  });

  it('shows a remove button per row with the matching data-profile-id', () => {
    const html = renderProfilesEditor({ developer: { label: 'Developer', description: 'x' } });

    expect(html).toContain('data-action="remove-profile"');
    expect(html).toMatch(/data-action="remove-profile" data-profile-id="developer"/);
  });

  it('escapes HTML in id, label, and description', () => {
    const html = renderProfilesEditor({ '<id>': { label: '<Dev>', description: '<script>alert(1)</script>' } });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<id>');
    expect(html).toContain('&lt;id&gt;');
    expect(html).toContain('&lt;Dev&gt;');
    expect(html).toContain('&lt;script&gt;');
  });
});
