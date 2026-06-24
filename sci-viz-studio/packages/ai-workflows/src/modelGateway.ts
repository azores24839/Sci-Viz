import type { AgentTask } from '@studio/contracts';
import type { ZodType } from 'zod';

export interface ModelGateway {
  generateStructured<T>(args: {
    task: AgentTask;
    input: unknown;
    schema: ZodType<T>;
    context: { projectId: string; promptVersion: string };
  }): Promise<T>;
}
