import type { Env } from "./db";
import {
  completeTaskRun,
  createTaskHandoff,
  failTaskRun,
  getTask,
  startTaskRun,
  submitTask,
  updateTaskHandoff,
  updateTaskStatus,
  type AgentTask,
  type TaskWorkflowInput,
} from "./agentTasks";
import { runDataQualityCheck, runContentLibrarianPreview } from "./agentTasks";
import { runSpecialistTask } from "./specialistAgents";

export type TaskExecutionOutcome = {
  taskId: string;
  roleKey: string;
  status: "completed" | "awaiting_review" | "failed";
  result?: Record<string, unknown>;
  error?: string;
  nextTaskId?: string;
};

type WorkflowStep = string | { roleKey: string; input?: Record<string, unknown> };

function workflowInput(task: AgentTask): TaskWorkflowInput | null {
  const candidate = task.input.workflow;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as { steps?: unknown; workflowId?: unknown; stepIndex?: unknown };
  if (!Array.isArray(value.steps) || !value.steps.length) return null;
  const steps = value.steps.filter((step): step is WorkflowStep =>
    typeof step === "string" || (typeof step === "object" && step !== null && typeof (step as { roleKey?: unknown }).roleKey === "string"),
  ).map((step) => typeof step === "string" ? step : { roleKey: step.roleKey, input: step.input });
  return {
    workflowId: typeof value.workflowId === "string" ? value.workflowId : undefined,
    steps,
    stepIndex: typeof value.stepIndex === "number" ? value.stepIndex : 0,
  };
}

async function roleKeyForTask(env: Env, task: AgentTask): Promise<string> {
  const role = await env.DB.prepare("SELECT role_key FROM agent_roles WHERE id=?").bind(task.roleId).first<{ role_key: string }>();
  if (!role) throw new Error(`Role not found: ${task.roleId}`);
  return role.role_key;
}

export async function dispatchTask(env: Env, taskId: string, depth = 0): Promise<void> {
  const task = await getTask(env, taskId);
  const hasWorkflow = Boolean(task?.input.workflow);
  if (hasWorkflow && env.AGENT_TASK_WORKFLOW) {
    await env.AGENT_TASK_WORKFLOW.create({ id: `agent-task-${taskId}`, params: { taskId } });
    return;
  }
  if (env.AGENT_TASK_QUEUE) {
    await env.AGENT_TASK_QUEUE.send({ taskId }, { contentType: "json" });
    return;
  }
  if (env.AGENT_TASK_WORKFLOW) {
    await env.AGENT_TASK_WORKFLOW.create({ id: `agent-task-${taskId}`, params: { taskId } });
    return;
  }
  // Local development fallback: preserve the same handoff semantics without
  // pretending that a local Worker has durable infrastructure.
  if (depth >= 16) throw new Error("Workflow depth limit reached");
  await runTaskById(env, taskId, depth + 1);
}

export async function advanceTaskHandoff(
  env: Env,
  task: AgentTask,
  roleKey: string,
  result: Record<string, unknown>,
  depth = 0,
): Promise<string | undefined> {
  const workflow = workflowInput(task);
  if (!workflow) return undefined;
  const currentIndex = workflow.stepIndex || 0;
  const nextIndex = currentIndex + 1;
  const nextStep = workflow.steps[nextIndex];
  if (!nextStep) return undefined;
  const nextRoleKey = typeof nextStep === "string" ? nextStep : nextStep.roleKey;
  const nextInput = typeof nextStep === "string" ? {} : nextStep.input || {};
  const workflowId = workflow.workflowId || task.id;
  const childInput: Record<string, unknown> = {
    ...nextInput,
    workflow: { workflowId, steps: workflow.steps, stepIndex: nextIndex },
    handoff: {
      parentTaskId: task.id,
      fromRoleKey: roleKey,
      sourceResult: result,
    },
  };
  const child = await submitTask(env, {
    creatorId: task.creatorId,
    roleKey: nextRoleKey,
    initiatorType: "system",
    initiatorId: `handoff:${task.id}`,
    input: childInput,
    idempotencyKey: `workflow:${workflowId}:${nextIndex}`,
    priority: task.priority,
  });
  const handoffId = await createTaskHandoff(env, {
    parentTaskId: task.id,
    childTaskId: child.task.id,
    fromRoleKey: roleKey,
    toRoleKey: nextRoleKey,
    sequenceIndex: nextIndex,
    payload: childInput.handoff as Record<string, unknown>,
    status: "created",
  });
  await updateTaskHandoff(env, handoffId, "dispatched");
  if (child.created) await dispatchTask(env, child.task.id, depth);
  return child.task.id;
}

export async function runTaskById(env: Env, taskId: string, depth = 0): Promise<TaskExecutionOutcome> {
  const task = await getTask(env, taskId);
  if (!task) throw new Error("Task not found");
  const roleKey = await roleKeyForTask(env, task);
  if (task.status !== "queued" && task.status !== "awaiting_review") {
    return { taskId, roleKey, status: task.status === "failed" ? "failed" : "completed", result: task.result || undefined };
  }
  await updateTaskStatus(env, taskId, "running");
  const runId = await startTaskRun(env, taskId, 1);
  try {
    let result: Record<string, unknown>;
    let status: "completed" | "awaiting_review";
    if (roleKey === "data_quality_monitor") {
      const report = await runDataQualityCheck(env, task.creatorId, task.id);
      result = report as unknown as Record<string, unknown>;
      status = "completed";
    } else if (roleKey === "content_librarian") {
      const preview = await runContentLibrarianPreview(env, task.creatorId, task.id);
      result = { preview };
      status = "awaiting_review";
    } else {
      const execution = await runSpecialistTask(env, task.creatorId, roleKey, task.input);
      result = execution.result;
      status = execution.status;
    }
    await completeTaskRun(env, runId, { ...result }, {
      provider: "deterministic",
      model: `${roleKey}-v1`,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
    await updateTaskStatus(env, taskId, status, result);
    if (task.input.handoff && typeof task.input.handoff === "object") {
      const handoff = task.input.handoff as { parentTaskId?: unknown };
      if (typeof handoff.parentTaskId === "string") {
        await env.DB.prepare("UPDATE agent_task_handoffs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE child_task_id=?").bind(status, taskId).run();
      }
    }
    const nextTaskId = status === "completed" ? await advanceTaskHandoff(env, { ...task, status, result }, roleKey, result, depth) : undefined;
    return { taskId, roleKey, status, result, nextTaskId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failTaskRun(env, runId, message);
    await updateTaskStatus(env, taskId, "failed", undefined, message);
    await env.DB.prepare("UPDATE agent_task_handoffs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE child_task_id=?").bind("failed", taskId).run();
    return { taskId, roleKey, status: "failed", error: message };
  }
}
