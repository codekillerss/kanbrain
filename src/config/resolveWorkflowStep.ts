import type { KanbrainConfig, WorkflowStepConfig, WorkItem } from '../types';

export function resolveWorkflowStep(config: KanbrainConfig, workItem: WorkItem): WorkflowStepConfig | null {
  return config.workflowSteps[workItem.type]?.[workItem.status] ?? null;
}
