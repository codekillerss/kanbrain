import { describe, it, expect } from 'vitest';
import { resolveDetailFields, type WorkItemTypeLayout } from './workItemDetail';

describe('resolveDetailFields', () => {
  it('falls back to a fixed field list when layout is null', () => {
    const rawFields = { 'System.State': 'Active', 'System.WorkItemType': 'Task', 'System.AreaPath': 'Proj\\Area' };

    const result = resolveDetailFields(null, rawFields);

    expect(result.groups).toEqual([
      {
        label: null,
        fields: [
          { refName: 'System.State', label: 'State', value: 'Active' },
          { refName: 'System.WorkItemType', label: 'Work Item Type', value: 'Task' },
          { refName: 'System.AreaPath', label: 'Area Path', value: 'Proj\\Area' },
        ],
      },
    ]);
    expect(result.htmlSections).toEqual([]);
  });

  it('falls back when the layout has no pages', () => {
    const layout: WorkItemTypeLayout = { pages: [] };

    const result = resolveDetailFields(layout, { 'System.State': 'Active' });

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
  });

  it('omits fallback fields that are absent from rawFields', () => {
    const result = resolveDetailFields(null, { 'System.State': 'Active' });

    expect(result.groups[0].fields).toEqual([{ refName: 'System.State', label: 'State', value: 'Active' }]);
  });

  it('groups layout controls by their group label, in encounter order', () => {
    const layout: WorkItemTypeLayout = {
      pages: [
        {
          sections: [
            {
              groups: [
                { label: 'Status', controls: [{ id: 'System.State', label: 'State', controlType: 'FieldControl' }] },
                { label: 'Planning', controls: [{ id: 'System.AreaPath', label: 'Area Path', controlType: 'FieldControl' }] },
              ],
            },
          ],
        },
      ],
    };
    const rawFields = { 'System.State': 'Active', 'System.AreaPath': 'Proj\\Area' };

    const result = resolveDetailFields(layout, rawFields);

    expect(result.groups).toEqual([
      { label: 'Status', fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] },
      { label: 'Planning', fields: [{ refName: 'System.AreaPath', label: 'Area Path', value: 'Proj\\Area' }] },
    ]);
  });

  it('uses a null group label for controls with no group label', () => {
    const layout: WorkItemTypeLayout = {
      pages: [{ sections: [{ groups: [{ controls: [{ id: 'System.State', label: 'State', controlType: 'FieldControl' }] }] }] }],
    };

    const result = resolveDetailFields(layout, { 'System.State': 'Active' });

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
  });

  it('separates HtmlFieldControl controls into htmlSections instead of the grid', () => {
    const layout: WorkItemTypeLayout = {
      pages: [
        {
          sections: [
            {
              groups: [
                {
                  controls: [
                    { id: 'System.State', label: 'State', controlType: 'FieldControl' },
                    { id: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', controlType: 'HtmlFieldControl' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const rawFields = { 'System.State': 'Active', 'Microsoft.VSTS.TCM.ReproSteps': '<p>Steps</p>' };

    const result = resolveDetailFields(layout, rawFields);

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
    expect(result.htmlSections).toEqual([{ refName: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', value: '<p>Steps</p>' }]);
  });

  it('excludes System.Title and System.Description from both the grid and htmlSections', () => {
    const layout: WorkItemTypeLayout = {
      pages: [
        {
          sections: [
            {
              groups: [
                {
                  controls: [
                    { id: 'System.Title', label: 'Title', controlType: 'FieldControl' },
                    { id: 'System.Description', label: 'Description', controlType: 'HtmlFieldControl' },
                    { id: 'System.State', label: 'State', controlType: 'FieldControl' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const rawFields = { 'System.Title': 'A title', 'System.Description': '<p>desc</p>', 'System.State': 'Active' };

    const result = resolveDetailFields(layout, rawFields);

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.State', label: 'State', value: 'Active' }] }]);
    expect(result.htmlSections).toEqual([]);
  });

  it('includes a field row even when the value is missing from rawFields', () => {
    const layout: WorkItemTypeLayout = {
      pages: [{ sections: [{ groups: [{ controls: [{ id: 'System.Tags', label: 'Tags', controlType: 'FieldControl' }] }] }] }],
    };

    const result = resolveDetailFields(layout, {});

    expect(result.groups).toEqual([{ label: null, fields: [{ refName: 'System.Tags', label: 'Tags', value: undefined }] }]);
  });
});
