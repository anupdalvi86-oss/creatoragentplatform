import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "./db";
import { runTaskById } from "./agentTaskRunner";

export type AgentWorkflowParams = { taskId: string };

export class AgentTaskWorkflow extends WorkflowEntrypoint<Env, AgentWorkflowParams> {
  async run(event: Readonly<WorkflowEvent<AgentWorkflowParams>>, step: WorkflowStep) {
    return step.do(
      "execute specialist task",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => JSON.stringify(await runTaskById(this.env, event.payload.taskId)),
    );
  }
}
