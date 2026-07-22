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
  development: DevelopmentLink[];
}

export type DevelopmentLink =
  | { kind: 'branch'; repositoryId: string; branchName: string }
  | { kind: 'pullRequest'; repositoryId: string; pullRequestId: number };

export interface PullRequestDetails {
  title: string;
  status: string;
}

export interface SkillEntry {
  path: string;
  label?: string;
  textColor?: string;
  buttonColor?: string;
}

export interface CardFieldSettings {
  parent: boolean;
  assignedTo: boolean;
}

export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  cardSettingsByBoard?: Record<string, Record<string, CardFieldSettings>>;
  showAssignedTo?: boolean;
}
