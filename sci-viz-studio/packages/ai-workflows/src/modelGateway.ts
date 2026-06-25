import type { AgentTask } from '@studio/contracts';
import type { ZodType } from 'zod';

export interface ModelGateway {
  generateText(args: {
    systemPrompt: string;
    userPrompt: string;
    context: { projectId: string; promptVersion: string };
  }): Promise<string>;

  generateStructured<T>(args: {
    task: AgentTask;
    input: unknown;
    schema: ZodType<T>;
    context: { projectId: string; promptVersion: string };
  }): Promise<T>;
}
