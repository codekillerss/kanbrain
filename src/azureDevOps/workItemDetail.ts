import type { AssignedTo } from '../types';

export interface WorkItemTypeLayoutControl {
  id: string;
  label: string;
  controlType: string;
}

export interface WorkItemTypeLayoutGroup {
  label?: string;
  controls: WorkItemTypeLayoutControl[];
}

export interface WorkItemTypeLayoutSection {
  groups: WorkItemTypeLayoutGroup[];
}

export interface WorkItemTypeLayoutPage {
  sections: WorkItemTypeLayoutSection[];
}

export interface WorkItemTypeLayout {
  pages: WorkItemTypeLayoutPage[];
}

export interface WorkItemComment {
  id: number;
  text: string;
  createdBy: AssignedTo;
  createdDate: string;
}

export interface DetailField {
  refName: string;
  label: string;
  value: unknown;
}

export interface DetailGroup {
  label: string | null;
  fields: DetailField[];
}

export interface DetailSections {
  groups: DetailGroup[];
  htmlSections: DetailField[];
}

const FALLBACK_FIELDS: { refName: string; label: string }[] = [
  { refName: 'System.State', label: 'State' },
  { refName: 'System.WorkItemType', label: 'Work Item Type' },
  { refName: 'System.AssignedTo', label: 'Assigned To' },
  { refName: 'System.AreaPath', label: 'Area Path' },
  { refName: 'System.IterationPath', label: 'Iteration Path' },
  { refName: 'System.Tags', label: 'Tags' },
  { refName: 'Microsoft.VSTS.Common.Priority', label: 'Priority' },
  { refName: 'System.CreatedBy', label: 'Created By' },
  { refName: 'System.CreatedDate', label: 'Created Date' },
  { refName: 'System.ChangedBy', label: 'Changed By' },
  { refName: 'System.ChangedDate', label: 'Changed Date' },
];

function resolveFallbackFields(rawFields: Record<string, unknown>): DetailField[] {
  return FALLBACK_FIELDS.filter(f => rawFields[f.refName] !== undefined).map(f => ({
    refName: f.refName,
    label: f.label,
    value: rawFields[f.refName],
  }));
}

export function resolveDetailFields(layout: WorkItemTypeLayout | null, rawFields: Record<string, unknown>): DetailSections {
  const controls = (layout?.pages ?? []).flatMap(page =>
    page.sections.flatMap(section =>
      section.groups.flatMap(group => group.controls.map(control => ({ ...control, groupLabel: group.label ?? null }))),
    ),
  );
  const usable = controls.filter(c => c.id !== 'System.Title' && c.id !== 'System.Description');

  if (usable.length === 0) {
    return { groups: [{ label: null, fields: resolveFallbackFields(rawFields) }], htmlSections: [] };
  }

  const htmlSections = usable
    .filter(c => c.controlType === 'HtmlFieldControl')
    .map(c => ({ refName: c.id, label: c.label, value: rawFields[c.id] }));

  const gridControls = usable.filter(c => c.controlType !== 'HtmlFieldControl');
  const order: string[] = [];
  const byGroup = new Map<string, DetailField[]>();
  for (const c of gridControls) {
    const key = c.groupLabel ?? '';
    if (!byGroup.has(key)) {
      order.push(key);
      byGroup.set(key, []);
    }
    byGroup.get(key)!.push({ refName: c.id, label: c.label, value: rawFields[c.id] });
  }

  return { groups: order.map(key => ({ label: key || null, fields: byGroup.get(key)! })), htmlSections };
}
