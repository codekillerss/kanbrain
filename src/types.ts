export interface WorkItem {
  id: number;
  title: string;
  description: string;
  status: string;
  type: string;
  url: string;
  parentId: number | null;
  childIds: number[];
}

export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, string | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
}
