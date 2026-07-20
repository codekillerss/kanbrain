export interface AssignedTo {
  displayName: string;
  imageUrl: string | null;
}

export interface WorkItem {
  id: number;
  title: string;
  description: string;
  status: string;
  type: string;
  url: string;
  parentId: number | null;
  childIds: number[];
  assignedTo: AssignedTo | null;
}

export interface SkillEntry {
  path: string;
  label?: string;
  textColor?: string;
  buttonColor?: string;
}

export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  showAssignedTo?: boolean;
}
