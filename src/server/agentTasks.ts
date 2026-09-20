import type { Env } from "./db";
import { id, json } from "./db";

// Agent Task/Run Foundation - Shared contracts for specialist-agent catalog
// Supports: role registry, task submission, durable state, audit trail, idempotency, bounded execution

export type TaskStatus = 'queued' | 'running' | 'awaiting_review' | 'completed' | 'failed' | 'cancelled';
export type InitiatorType = 'admin' | 'user' | 'system' | 'webhook';
export type RoleCategory = 'content' | 'consumer' | 'engineering' | 'operations';

export interface AgentRole {
  id: string;
  roleKey: string;
  roleName: string;
  description: string;
  category: RoleCategory;
  enabled: boolean;
  maxConcurrency: number;
  maxRetries: number;
  maxTimeSeconds: number;
  maxTokens: number;
  maxCostUsd: number;
  requiresApproval: boolean;
}

export interface AgentTask {
  id: string;
  creatorId: string;
  roleId: string;
  initiatorType: InitiatorType;
  initiatorId: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  status: TaskStatus;
  priority: number;
  startedAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskRun {
  id: string;
  taskId: string;
  runNumber: number;
  status: 'started' | 'completed' | 'failed';
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  startedAt: string;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface TaskSubmission {
  creatorId: string;
  roleKey: string;
  initiatorType: InitiatorType;
  initiatorId: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
}

export interface DataQualityFinding {
  id: string;
  creatorId: string;
  taskId: string | null;
  findingType: 'duplicate_content' | 'missing_metadata' | 'stale_record' | 'incomplete_rights' | 'unsourced_claim' | 'orphaned_embedding' | 'schema_mismatch';
  severity: 'info' | 'warning' | 'error';
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  suggestedAction: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolution: string | null;
  createdAt: string;
}

// Role Registry: allowlisted roles with bounded execution parameters
export async function getRole(env: Env, roleKey: string): Promise<AgentRole | null> {
  const row = await env.DB.prepare(
    `SELECT id, role_key, role_name, description, category, enabled, max_concurrency, max_retries, 
            max_time_seconds, max_tokens, max_cost_usd, requires_approval
     FROM agent_roles WHERE role_key = ?`
  ).bind(roleKey).first<{
    id: string; role_key: string; role_name: string; description: string; category: string;
    enabled: number; max_concurrency: number; max_retries: number; max_time_seconds: number;
    max_tokens: number; max_cost_usd: number; requires_approval: number;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    roleKey: row.role_key,
    roleName: row.role_name,
    description: row.description,
    category: row.category as RoleCategory,
    enabled: Boolean(row.enabled),
    maxConcurrency: row.max_concurrency,
    maxRetries: row.max_retries,
    maxTimeSeconds: row.max_time_seconds,
    maxTokens: row.max_tokens,
    maxCostUsd: row.max_cost_usd,
    requiresApproval: Boolean(row.requires_approval),
  };
}

export async function listRoles(env: Env, category?: RoleCategory, enabledOnly = true): Promise<AgentRole[]> {
  let sql = `SELECT id, role_key, role_name, description, category, enabled, max_concurrency, max_retries, 
                    max_time_seconds, max_tokens, max_cost_usd, requires_approval
             FROM agent_roles WHERE 1=1`;
  const params: (string | number)[] = [];
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (enabledOnly) {
    sql += ` AND enabled = 1`;
  }
  sql += ` ORDER BY category, role_name`;
  const { results } = await env.DB.prepare(sql).bind(...params).all<{
    id: string; role_key: string; role_name: string; description: string; category: string;
    enabled: number; max_concurrency: number; max_retries: number; max_time_seconds: number;
    max_tokens: number; max_cost_usd: number; requires_approval: number;
  }>();
  return results.map(row => ({
    id: row.id,
    roleKey: row.role_key,
    roleName: row.role_name,
    description: row.description,
    category: row.category as RoleCategory,
    enabled: Boolean(row.enabled),
    maxConcurrency: row.max_concurrency,
    maxRetries: row.max_retries,
    maxTimeSeconds: row.max_time_seconds,
    maxTokens: row.max_tokens,
    maxCostUsd: row.max_cost_usd,
    requiresApproval: Boolean(row.requires_approval),
  }));
}

// Task Submission with idempotency and concurrency limits
export async function submitTask(
  env: Env,
  submission: TaskSubmission
): Promise<{ task: AgentTask; created: boolean; previousStatus?: TaskStatus }> {
  const role = await getRole(env, submission.roleKey);
  if (!role) throw new Error(`Role not found: ${submission.roleKey}`);
  if (!role.enabled) throw new Error(`Role disabled: ${submission.roleKey}`);

  const idempotencyKey = submission.idempotencyKey || `${submission.initiatorType}:${submission.initiatorId}:${Date.now()}`;
  
  // Check for existing task with same idempotency key
  const existing = await env.DB.prepare(
    `SELECT id, status FROM agent_tasks 
     WHERE creator_id = ? AND role_id = ? AND idempotency_key = ?`
  ).bind(submission.creatorId, role.id, idempotencyKey).first<{ id: string; status: TaskStatus }>();

  if (existing) {
    const task = await getTask(env, existing.id);
    if (!task) throw new Error('Task lookup failed after idempotency hit');
    return { task, created: false, previousStatus: existing.status };
  }

  // Check concurrency limits
  const runningCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM agent_tasks 
     WHERE creator_id = ? AND role_id = ? AND status IN ('queued','running')`
  ).bind(submission.creatorId, role.id).first<{ count: number }>();
  
  if (runningCount && runningCount.count >= role.maxConcurrency) {
    throw new Error(`Concurrency limit reached for role ${submission.roleKey}: ${role.maxConcurrency}`);
  }

  const taskId = id();
  const now = new Date().toISOString();
  
  await env.DB.prepare(
    `INSERT INTO agent_tasks(id,creator_id,role_id,initiator_type,initiator_id,idempotency_key,input_json,status,priority,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    taskId, submission.creatorId, role.id, submission.initiatorType, submission.initiatorId,
    idempotencyKey, JSON.stringify(submission.input), 
    role.requiresApproval ? 'awaiting_review' : 'queued',
    submission.priority ?? 5, now, now
  ).run();

  const task = await getTask(env, taskId);
  if (!task) throw new Error('Task creation failed');
  return { task, created: true };
}

export async function getTask(env: Env, taskId: string): Promise<AgentTask | null> {
  const row = await env.DB.prepare(
    `SELECT id, creator_id, role_id, initiator_type, initiator_id, idempotency_key, input_json, status, priority,
            started_at, completed_at, result_json, error_message, created_at, updated_at
     FROM agent_tasks WHERE id = ?`
  ).bind(taskId).first<{
    id: string; creator_id: string; role_id: string; initiator_type: string; initiator_id: string;
    idempotency_key: string; input_json: string; status: TaskStatus; priority: number;
    started_at: string | null; completed_at: string | null; result_json: string | null;
    error_message: string | null; created_at: string; updated_at: string;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    creatorId: row.creator_id,
    roleId: row.role_id,
    initiatorType: row.initiator_type as InitiatorType,
    initiatorId: row.initiator_id,
    idempotencyKey: row.idempotency_key,
    input: JSON.parse(row.input_json),
    status: row.status,
    priority: row.priority,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTasks(
  env: Env,
  filters: { creatorId?: string; roleId?: string; status?: TaskStatus; initiatorId?: string },
  limit = 50
): Promise<AgentTask[]> {
  let sql = `SELECT id, creator_id, role_id, initiator_type, initiator_id, idempotency_key, input_json, status, priority,
                    started_at, completed_at, result_json, error_message, created_at, updated_at
             FROM agent_tasks WHERE 1=1`;
  const params: (string | number)[] = [];
  if (filters.creatorId) {
    sql += ` AND creator_id = ?`;
    params.push(filters.creatorId);
  }
  if (filters.roleId) {
    sql += ` AND role_id = ?`;
    params.push(filters.roleId);
  }
  if (filters.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters.initiatorId) {
    sql += ` AND initiator_id = ?`;
    params.push(filters.initiatorId);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  
  const { results } = await env.DB.prepare(sql).bind(...params).all<{
    id: string; creator_id: string; role_id: string; initiator_type: string; initiator_id: string;
    idempotency_key: string; input_json: string; status: TaskStatus; priority: number;
    started_at: string | null; completed_at: string | null; result_json: string | null;
    error_message: string | null; created_at: string; updated_at: string;
  }>();
  
  return results.map(row => ({
    id: row.id,
    creatorId: row.creator_id,
    roleId: row.role_id,
    initiatorType: row.initiator_type as InitiatorType,
    initiatorId: row.initiator_id,
    idempotencyKey: row.idempotency_key,
    input: JSON.parse(row.input_json),
    status: row.status,
    priority: row.priority,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateTaskStatus(
  env: Env,
  taskId: string,
  status: TaskStatus,
  result?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();
  const updates: string[] = ['status = ?', 'updated_at = ?'];
  const params: (string | null)[] = [status, now];
  
  if (status === 'running') {
    updates.push('started_at = ?');
    params.push(now);
  }
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updates.push('completed_at = ?');
    params.push(now);
  }
  if (result !== undefined) {
    updates.push('result_json = ?');
    params.push(JSON.stringify(result));
  }
  if (errorMessage !== undefined) {
    updates.push('error_message = ?');
    params.push(errorMessage);
  }
  params.push(taskId);
  
  await env.DB.prepare(
    `UPDATE agent_tasks SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();
}

// Task Run tracking for audit trail
export async function startTaskRun(env: Env, taskId: string, runNumber: number): Promise<string> {
  const runId = id();
  await env.DB.prepare(
    `INSERT INTO agent_task_runs(id,task_id,run_number,status,started_at)
     VALUES(?,?,?,?,CURRENT_TIMESTAMP)`
  ).bind(runId, taskId, runNumber, 'started').run();
  return runId;
}

export async function completeTaskRun(
  env: Env,
  runId: string,
  result: Record<string, unknown>,
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number }
): Promise<void> {
  await env.DB.prepare(
    `UPDATE agent_task_runs SET status = ?, completed_at = CURRENT_TIMESTAMP, result_json = ?,
      provider = ?, model = ?, input_tokens = ?, output_tokens = ?, estimated_cost_usd = ?
     WHERE id = ?`
  ).bind('completed', JSON.stringify(result), usage.provider, usage.model, usage.inputTokens, usage.outputTokens, usage.estimatedCostUsd, runId).run();
}

export async function failTaskRun(
  env: Env,
  runId: string,
  errorMessage: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE agent_task_runs SET status = ?, completed_at = CURRENT_TIMESTAMP, error_message = ?
     WHERE id = ?`
  ).bind('failed', errorMessage, runId).run();
}

// Data Quality Monitor: Detect issues in tenant data
export async function recordDataQualityFinding(
  env: Env,
  finding: Omit<DataQualityFinding, 'id' | 'createdAt'>
): Promise<string> {
  const findingId = id();
  await env.DB.prepare(
    `INSERT INTO data_quality_findings(id,creator_id,task_id,finding_type,severity,resource_type,resource_id,details_json,suggested_action,reviewed_at,reviewed_by,resolution,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
  ).bind(
    findingId, finding.creatorId, finding.taskId, finding.findingType, finding.severity,
    finding.resourceType, finding.resourceId, JSON.stringify(finding.details), finding.suggestedAction,
    finding.reviewedAt, finding.reviewedBy, finding.resolution
  ).run();
  return findingId;
}

export async function listDataQualityFindings(
  env: Env,
  creatorId: string,
  filters?: { severity?: 'info' | 'warning' | 'error'; findingType?: string; reviewed?: boolean },
  limit = 100
): Promise<DataQualityFinding[]> {
  let sql = `SELECT id, creator_id, task_id, finding_type, severity, resource_type, resource_id, details_json,
                    suggested_action, reviewed_at, reviewed_by, resolution, created_at
             FROM data_quality_findings WHERE creator_id = ?`;
  const params: (string | number | boolean | null)[] = [creatorId];
  if (filters?.severity) {
    sql += ` AND severity = ?`;
    params.push(filters.severity);
  }
  if (filters?.findingType) {
    sql += ` AND finding_type = ?`;
    params.push(filters.findingType);
  }
  if (filters?.reviewed !== undefined) {
    sql += filters.reviewed ? ` AND reviewed_at IS NOT NULL` : ` AND reviewed_at IS NULL`;
  }
  sql += ` ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC LIMIT ?`;
  params.push(limit);
  
  const { results } = await env.DB.prepare(sql).bind(...params).all<{
    id: string; creator_id: string; task_id: string | null; finding_type: string; severity: string;
    resource_type: string; resource_id: string | null; details_json: string;
    suggested_action: string | null; reviewed_at: string | null; reviewed_by: string | null;
    resolution: string | null; created_at: string;
  }>();
  
  console.log('DEBUG listDataQualityFindings results:', results.length);
  return results.map(row => {
    console.log('DEBUG mapping row:', { id: row.id, details_json: row.details_json });
    return {
    id: row.id,
    creatorId: row.creator_id,
    taskId: row.task_id,
    findingType: row.finding_type as DataQualityFinding['findingType'],
    severity: row.severity as DataQualityFinding['severity'],
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: JSON.parse(row.details_json),
    suggestedAction: row.suggested_action,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    resolution: row.resolution,
    createdAt: row.created_at,
  }});
}

// Data Quality Check execution
export async function runDataQualityCheck(
  env: Env,
  creatorId: string,
  taskId?: string
): Promise<{ findings: DataQualityFinding[]; summary: { total: number; errors: number; warnings: number; info: number } }> {
  const findings: DataQualityFinding[] = [];
  
  // Check for duplicate content (same external_id across sources)
  const duplicateContent = await env.DB.prepare(
    `SELECT external_id, COUNT(*) as count, GROUP_CONCAT(id) as content_ids
     FROM content_items WHERE creator_id = ? AND external_id IS NOT NULL
     GROUP BY external_id HAVING count > 1`
  ).bind(creatorId).all<{ external_id: string; count: number; content_ids: string }>();
  
  console.log('DEBUG duplicateContent:', duplicateContent.results.length, duplicateContent.results);
  
  for (const dup of duplicateContent.results || []) {
    console.log('DEBUG processing dup:', dup);
    const findingId = await recordDataQualityFinding(env, {
      creatorId,
      taskId: taskId || null,
      findingType: 'duplicate_content',
      severity: 'warning',
      resourceType: 'content_item',
      resourceId: dup.external_id,
      details: { duplicateCount: dup.count, contentIds: dup.content_ids.split(',') },
      suggestedAction: 'Review duplicates and consider deduplication via Content Librarian',
      reviewedAt: null,
      reviewedBy: null,
      resolution: null,
    });
    const row = await env.DB.prepare(
      `SELECT id, creator_id, task_id, finding_type, severity, resource_type, resource_id, details_json,
              suggested_action, reviewed_at, reviewed_by, resolution, created_at
       FROM data_quality_findings WHERE id = ?`
    ).bind(findingId).first<{
      id: string; creator_id: string; task_id: string | null; finding_type: string; severity: string;
      resource_type: string; resource_id: string | null; details_json: string;
      suggested_action: string | null; reviewed_at: string | null; reviewed_by: string | null;
      resolution: string | null; created_at: string;
    }>();
    if (row) {
      findings.push({
        id: row.id,
        creatorId: row.creator_id,
        taskId: row.task_id,
        findingType: row.finding_type as DataQualityFinding['findingType'],
        severity: row.severity as DataQualityFinding['severity'],
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        details: JSON.parse(row.details_json),
        suggestedAction: row.suggested_action,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        resolution: row.resolution,
        createdAt: row.created_at,
      });
    }
  }
  
  // Check for missing metadata
  const missingMetadata = await env.DB.prepare(
    `SELECT id, title, description, structured_json FROM content_items 
     WHERE creator_id = ? AND (structured_json = '{}' OR structured_json IS NULL)`
  ).bind(creatorId).all<{ id: string; title: string; description: string }>();
  
  for (const item of missingMetadata.results || []) {
    const findingId = await recordDataQualityFinding(env, {
      creatorId,
      taskId: taskId || null,
      findingType: 'missing_metadata',
      severity: 'info',
      resourceType: 'content_item',
      resourceId: item.id,
      details: { title: item.title, hasDescription: Boolean(item.description) },
      suggestedAction: 'Run Recipe Extraction or manual metadata entry',
      reviewedAt: null,
      reviewedBy: null,
      resolution: null,
    });
    const row = await env.DB.prepare(
      `SELECT id, creator_id, task_id, finding_type, severity, resource_type, resource_id, details_json,
              suggested_action, reviewed_at, reviewed_by, resolution, created_at
       FROM data_quality_findings WHERE id = ?`
    ).bind(findingId).first<{
      id: string; creator_id: string; task_id: string | null; finding_type: string; severity: string;
      resource_type: string; resource_id: string | null; details_json: string;
      suggested_action: string | null; reviewed_at: string | null; reviewed_by: string | null;
      resolution: string | null; created_at: string;
    }>();
    if (row) {
      findings.push({
        id: row.id,
        creatorId: row.creator_id,
        taskId: row.task_id,
        findingType: row.finding_type as DataQualityFinding['findingType'],
        severity: row.severity as DataQualityFinding['severity'],
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        details: JSON.parse(row.details_json),
        suggestedAction: row.suggested_action,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        resolution: row.resolution,
        createdAt: row.created_at,
      });
    }
  }
  
  // Check for incomplete rights
  const incompleteRights = await env.DB.prepare(
    `SELECT id, title, rights_status FROM content_items 
     WHERE creator_id = ? AND rights_status = 'unknown_rights'`
  ).bind(creatorId).all<{ id: string; title: string }>();
  
  console.log('DEBUG incompleteRights:', incompleteRights.results.length, incompleteRights.results);
  
  for (const item of incompleteRights.results || []) {
    const findingId = await recordDataQualityFinding(env, {
      creatorId,
      taskId: taskId || null,
      findingType: 'incomplete_rights',
      severity: 'error',
      resourceType: 'content_item',
      resourceId: item.id,
      details: { title: item.title, currentStatus: 'unknown_rights' },
      suggestedAction: 'Run Rights Reviewer or obtain creator authorization',
      reviewedAt: null,
      reviewedBy: null,
      resolution: null,
    });
    const row2 = await env.DB.prepare(
      `SELECT id, creator_id, task_id, finding_type, severity, resource_type, resource_id, details_json,
              suggested_action, reviewed_at, reviewed_by, resolution, created_at
       FROM data_quality_findings WHERE id = ?`
    ).bind(findingId).first<{
      id: string; creator_id: string; task_id: string | null; finding_type: string; severity: string;
      resource_type: string; resource_id: string | null; details_json: string;
      suggested_action: string | null; reviewed_at: string | null; reviewed_by: string | null;
      resolution: string | null; created_at: string;
    }>();
    if (row2) {
      findings.push({
        id: row2.id,
        creatorId: row2.creator_id,
        taskId: row2.task_id,
        findingType: row2.finding_type as DataQualityFinding['findingType'],
        severity: row2.severity as DataQualityFinding['severity'],
        resourceType: row2.resource_type,
        resourceId: row2.resource_id,
        details: JSON.parse(row2.details_json),
        suggestedAction: row2.suggested_action,
        reviewedAt: row2.reviewed_at,
        reviewedBy: row2.reviewed_by,
        resolution: row2.resolution,
        createdAt: row2.created_at,
      });
    }
  }
  
  // Check for orphaned embeddings (if Vectorize is configured)
  const orphanedEmbeddings = await env.DB.prepare(
    `SELECT ce.id, ce.content_id, ce.vector_id FROM content_embeddings ce
     LEFT JOIN content_items ci ON ce.content_id = ci.id
     WHERE ce.creator_id = ? AND ci.id IS NULL`
  ).bind(creatorId).all<{ id: string; content_id: string; vector_id: string }>();
  
  for (const emb of orphanedEmbeddings.results || []) {
    const findingId = await recordDataQualityFinding(env, {
      creatorId,
      taskId: taskId || null,
      findingType: 'orphaned_embedding',
      severity: 'warning',
      resourceType: 'content_embedding',
      resourceId: emb.id,
      details: { contentId: emb.content_id, vectorId: emb.vector_id },
      suggestedAction: 'Clean up orphaned embedding records',
      reviewedAt: null,
      reviewedBy: null,
      resolution: null,
    });
    const finding = await env.DB.prepare(
      `SELECT id, creator_id, task_id, finding_type, severity, resource_type, resource_id, details_json,
              suggested_action, reviewed_at, reviewed_by, resolution, created_at
       FROM data_quality_findings WHERE id = ?`
    ).bind(findingId).first<DataQualityFinding>();
    if (finding) findings.push(finding);
  }
  
  const summary = {
    total: findings.length,
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
  };
  
  return { findings, summary };
}
