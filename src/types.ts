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
  statusSkills: Record<string, string | null>;
}
