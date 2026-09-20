import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRole,
  listRoles,
  submitTask,
  getTask,
  listTasks,
  updateTaskStatus,
  startTaskRun,
  completeTaskRun,
  failTaskRun,
  runDataQualityCheck,
  listDataQualityFindings,
  recordDataQualityFinding,
  type TaskSubmission,
} from '../src/server/agentTasks';
import type { Env } from '../src/server/db';

// Mock D1 database
function createMockDb() {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    agent_roles: [],
    agent_tasks: [],
    agent_task_runs: [],
    data_quality_findings: [],
    content_items: [],
    content_sources: [],
    content_embeddings: [],
    creators: [],
  } as Record<string, Array<Record<string, unknown>>>;
  
  const boundValueForClause = (sql: string, values: unknown[], clause: RegExp): unknown => {
    const match = clause.exec(sql);
    if (!match || match.index === undefined || match[1] !== '?') return match?.[1]?.replace(/^['"]|['"]$/g, '');
    const placeholdersBefore = (sql.slice(0, match.index).match(/\?/g) || []).length;
    return values[placeholdersBefore];
  };
  
  return {
    tables,
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              // Simple query parsing for testing
              // Check idempotency query first (3 values: creatorId, roleId, idempotencyKey)
              if (sql.includes('idempotency_key') && values.length === 3) {
                const [creatorId, roleId, idempotencyKey] = values as string[];
                const found = tables.agent_tasks!.find(t => 
                  t.creator_id === creatorId && t.role_id === roleId && t.idempotency_key === idempotencyKey
                );
                return found ? (found as T) : null;
              }
              if (sql.includes('FROM agent_roles WHERE role_key')) {
                const roleKey = values[0] as string;
                const found = tables.agent_roles!.find(r => r.role_key === roleKey);
                return found ? (found as T) : null;
              }
              if (sql.includes('FROM agent_tasks WHERE id')) {
                const id = values[0] as string;
                const found = tables.agent_tasks!.find(t => t.id === id);
                return found ? (found as T) : null;
              }
              if (sql.includes('FROM data_quality_findings WHERE id')) {
                const id = values[0] as string;
                const found = tables.data_quality_findings!.find(f => f.id === id);
                return found ? (found as T) : null;
              }
              if (sql.includes('COUNT(*) as count FROM agent_tasks')) {
                const [creatorId, roleId] = values as string[];
                const count = tables.agent_tasks!.filter(t => 
                  t.creator_id === creatorId && t.role_id === roleId && 
                  ['queued', 'running'].includes(t.status as string)
                ).length;
                return { count } as T;
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO agent_roles')) {
                const [id, roleKey, roleName, description, category, enabled, maxConcurrency, maxRetries, maxTimeSeconds, maxTokens, maxCostUsd, requiresApproval] = values as unknown[];
                tables.agent_roles!.push({
                  id, role_key: roleKey, role_name: roleName, description, category,
                  enabled, max_concurrency: maxConcurrency, max_retries: maxRetries,
                  max_time_seconds: maxTimeSeconds, max_tokens: maxTokens, max_cost_usd: maxCostUsd,
                  requires_approval: requiresApproval, created_at: new Date().toISOString()
                });
              }
              if (sql.includes('INSERT INTO agent_tasks')) {
                const [id, creatorId, roleId, initiatorType, initiatorId, idempotencyKey, inputJson, status, priority, createdAt, updatedAt] = values as unknown[];
                tables.agent_tasks!.push({
                  id, creator_id: creatorId, role_id: roleId, initiator_type: initiatorType,
                  initiator_id: initiatorId, idempotency_key: idempotencyKey, input_json: inputJson,
                  status, priority, created_at: createdAt, updated_at: updatedAt,
                  started_at: null, completed_at: null, result_json: null, error_message: null
                });
              }
              if (sql.includes('UPDATE agent_tasks')) {
                // Update task status - dynamic SQL with variable number of params
                const taskId = values[values.length - 1] as string;
                const task = tables.agent_tasks!.find(t => t.id === taskId);
                if (task) {
                  // First value is always status
                  task.status = values[0] as string;
                  // Second value is always updated_at
                  task.updated_at = values[1] as string;
                  
                  // Check remaining values by looking at the SQL
                  if (sql.includes('started_at = ?')) {
                    const idx = values.findIndex((v, i) => i > 1 && v === values[1]);
                    if (idx > 0) task.started_at = values[idx] as string;
                  }
                  if (sql.includes('completed_at = ?')) {
                    const idx = values.findIndex((v, i) => i > 1 && v === values[1] && i % 2 === 0);
                    if (idx > 0) task.completed_at = values[idx] as string;
                  }
                  if (sql.includes('result_json = ?')) {
                    const resultIdx = values.findIndex((v, i) => 
                      i > 1 && typeof v === 'string' && v.startsWith('{') && v.includes('result')
                    );
                    if (resultIdx > 0) task.result_json = values[resultIdx] as string;
                  }
                  if (sql.includes('error_message = ?')) {
                    const errorIdx = values.findIndex((v, i) => 
                      i > 1 && typeof v === 'string' && !v.startsWith('{') && !v.includes('T')
                    );
                    if (errorIdx > 0) task.error_message = values[errorIdx] as string;
                  }
                }
              }
              if (sql.includes('INSERT INTO agent_task_runs')) {
                const [runId, taskId, runNumber, status, startedAt] = values as unknown[];
                tables.agent_task_runs!.push({
                  id: runId, task_id: taskId, run_number: runNumber, status,
                  started_at: startedAt, completed_at: null, result_json: null,
                  error_message: null, provider: null, model: null,
                  input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0
                });
              }
              if (sql.includes('UPDATE agent_task_runs')) {
                const runId = values[values.length - 1] as string;
                const run = tables.agent_task_runs!.find(r => r.id === runId);
                if (run) {
                  run.status = values[0] as string;
                  // completed_at is set by CURRENT_TIMESTAMP in SQL, use current time
                  run.completed_at = new Date().toISOString();
                  // Check if this is completeTaskRun (8 params) or failTaskRun (3 params)
                  if (values.length === 8) {
                    // completeTaskRun: status, result_json, provider, model, input_tokens, output_tokens, estimated_cost_usd, id
                    if (values[1] !== undefined) run.result_json = values[1] as string;
                    if (values[2] !== undefined) run.provider = values[2] as string;
                    if (values[3] !== undefined) run.model = values[3] as string;
                    if (values[4] !== undefined) run.input_tokens = values[4] as number;
                    if (values[5] !== undefined) run.output_tokens = values[5] as number;
                    if (values[6] !== undefined) run.estimated_cost_usd = values[6] as number;
                  } else if (values.length === 3) {
                    // failTaskRun: status, error_message, id
                    if (values[1] !== undefined) run.error_message = values[1] as string;
                  }
                }
              }
              if (sql.includes('INSERT INTO data_quality_findings')) {
                // SQL has 12 bound values + CURRENT_TIMESTAMP for created_at
                const [findingId, creatorId, taskId, findingType, severity, resourceType, resourceId, detailsJson, suggestedAction, reviewedAt, reviewedBy, resolution] = values as unknown[];
                tables.data_quality_findings!.push({
                  id: findingId, creator_id: creatorId, task_id: taskId, finding_type: findingType,
                  severity, resource_type: resourceType, resource_id: resourceId,
                  details_json: detailsJson, suggested_action: suggestedAction,
                  reviewed_at: reviewedAt, reviewed_by: reviewedBy, resolution, created_at: new Date().toISOString()
                });
              }
              return {};
            },
            async all<T>(): Promise<{ results: T[] }> {
              if (sql.includes('FROM agent_roles WHERE')) {
                const category = values[0] as string;
                return { results: tables.agent_roles!.filter(r => r.category === category && r.enabled === 1) as T[] };
              }
              if (sql.includes('FROM agent_tasks WHERE')) {
                const creatorId = boundValueForClause(sql, values, /creator_id\s*=\s*(\?|'.*?')/i) as string;
                let results = tables.agent_tasks!.filter(t => t.creator_id === creatorId);
                const status = boundValueForClause(sql, values, /status\s*=\s*(\?|'.*?')/i) as string | undefined;
                if (status) {
                  results = results.filter(t => t.status === status);
                }
                return { results: results.slice(0, 50) as T[] };
              }
              if (sql.includes('FROM data_quality_findings WHERE creator_id')) {
                const creatorId = values[0] as string;
                let results = tables.data_quality_findings!.filter(f => f.creator_id === creatorId);
                // Check if there's a severity filter (values[1] would be severity if present, not limit)
                // The SQL has LIMIT ? at the end, so values[1] could be the limit
                // We need to check if the SQL has 'severity = ?' to determine if values[1] is severity
                if (sql.includes('severity = ?') && values[1]) {
                  results = results.filter(f => f.severity === values[1]);
                }
                return { results: results.slice(0, 100) as T[] };
              }
              if (/FROM content_items\s+WHERE creator_id/i.test(sql) && !sql.includes('HAVING')) {
                const creatorId = boundValueForClause(sql, values, /creator_id\s*=\s*(\?|'.*?')/i) as string;
                let results = tables.content_items!.filter(i => i.creator_id === creatorId);
                const rightsStatus = boundValueForClause(sql, values, /rights_status\s*=\s*(\?|'.*?')/i) as string | undefined;
                if (rightsStatus) {
                  results = results.filter(i => i.rights_status === rightsStatus);
                }
                return { results: results as T[] };
              }
              // Handle duplicate content check query
              if (sql.includes('HAVING count > 1')) {
                const creatorId = values[0] as string;
                const items = tables.content_items!.filter(i => i.creator_id === creatorId && i.external_id);
                const grouped: Record<string, typeof items> = {};
                for (const item of items) {
                  const key = item.external_id as string;
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(item);
                }
                const duplicates = Object.entries(grouped)
                  .filter(([, items]) => items.length > 1)
                  .map(([externalId, items]) => ({
                    external_id: externalId,
                    count: items.length,
                    content_ids: items.map(i => i.id).join(',')
                  }));
                return { results: duplicates as T[] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

function createEnv(): Env {
  const db = createMockDb();
  return {
    DB: db as unknown as D1Database,
    APP_ENV: 'test',
    SESSION_SECRET: 'test-secret',
    AI_PRIMARY: 'mock',
    AI_FALLBACK: 'mock',
    AI_MODEL_CHEAP: 'test',
    AI_MODEL_STANDARD: 'test',
    AI_MODEL_REASONING: 'test',
  } as Env;
}

// Seed test data
async function seedTestData(env: Env) {
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  db.tables.agent_roles!.push({
    id: 'role-dqm-001',
    role_key: 'data_quality_monitor',
    role_name: 'Data Quality Monitor',
    description: 'Detect stale, duplicate, incomplete or unsourced tenant records',
    category: 'operations',
    enabled: 1,
    max_concurrency: 3,
    max_retries: 2,
    max_time_seconds: 300,
    max_tokens: 2000,
    max_cost_usd: 0.05,
    requires_approval: 0,
    created_at: new Date().toISOString(),
  });
  db.tables.agent_roles!.push({
    id: 'role-lib-001',
    role_key: 'content_librarian',
    role_name: 'Content Librarian',
    description: 'Deduplicate, tag and organize tenant content',
    category: 'content',
    enabled: 1,
    max_concurrency: 2,
    max_retries: 2,
    max_time_seconds: 300,
    max_tokens: 2000,
    max_cost_usd: 0.05,
    requires_approval: 1,
    created_at: new Date().toISOString(),
  });
  db.tables.creators!.push({ id: 'creator-one', slug: 'test-creator', name: 'Test Creator', category: 'cooking', status: 'active' });
}

test('role registry returns allowlisted roles', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const role = await getRole(env, 'data_quality_monitor');
  assert.ok(role);
  assert.equal(role?.roleKey, 'data_quality_monitor');
  assert.equal(role?.category, 'operations');
  assert.equal(role?.enabled, true);
  assert.equal(role?.requiresApproval, false);
  
  const missing = await getRole(env, 'nonexistent_role');
  assert.equal(missing, null);
});

test('role listing filters by category', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const operations = await listRoles(env, 'operations', true);
  assert.equal(operations.length, 1);
  assert.equal(operations[0]!.roleKey, 'data_quality_monitor');
  
  const content = await listRoles(env, 'content', true);
  assert.equal(content.length, 1);
  assert.equal(content[0]!.roleKey, 'content_librarian');
  assert.equal(content[0]!.requiresApproval, true);
});

test('task submission with idempotency prevents duplicates', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const submission: TaskSubmission = {
    creatorId: 'creator-one',
    roleKey: 'data_quality_monitor',
    initiatorType: 'admin',
    initiatorId: 'admin-001',
    input: { checkType: 'full' },
    idempotencyKey: 'test-key-001',
    priority: 5,
  };
  
  const { task, created } = await submitTask(env, submission);
  assert.ok(task);
  assert.equal(created, true);
  assert.equal(task.status, 'queued');
  assert.equal(task.initiatorType, 'admin');
  
  // Same idempotency key should return existing task
  const { task: task2, created: created2, previousStatus } = await submitTask(env, submission);
  assert.equal(created2, false);
  assert.equal(previousStatus, 'queued');
  assert.equal(task2.id, task.id);
});

test('task submission respects concurrency limits', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  // Submit 3 tasks (max concurrency for data_quality_monitor)
  for (let i = 0; i < 3; i++) {
    await submitTask(env, {
      creatorId: 'creator-one',
      roleKey: 'data_quality_monitor',
      initiatorType: 'admin',
      initiatorId: `admin-${i}`,
      input: { checkType: 'full' },
      idempotencyKey: `concurrency-key-${i}`,
      priority: 5,
    });
  }
  
  // 4th task should fail due to concurrency limit
  await assert.rejects(
    async () => await submitTask(env, {
      creatorId: 'creator-one',
      roleKey: 'data_quality_monitor',
      initiatorType: 'admin',
      initiatorId: 'admin-004',
      input: { checkType: 'full' },
      idempotencyKey: 'concurrency-key-004',
      priority: 5,
    }),
    /Concurrency limit reached/
  );
});

test('disabled roles cannot submit tasks', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  // Disable the role
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  const role = db.tables.agent_roles!.find(r => r.role_key === 'data_quality_monitor');
  if (role) role.enabled = 0;
  
  await assert.rejects(
    async () => await submitTask(env, {
      creatorId: 'creator-one',
      roleKey: 'data_quality_monitor',
      initiatorType: 'admin',
      initiatorId: 'admin-001',
      input: { checkType: 'full' },
    }),
    /Role disabled/
  );
});

test('tasks requiring approval go to awaiting_review status', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const { task } = await submitTask(env, {
    creatorId: 'creator-one',
    roleKey: 'content_librarian',
    initiatorType: 'admin',
    initiatorId: 'admin-001',
    input: { operation: 'deduplicate' },
  });
  
  assert.equal(task.status, 'awaiting_review');
});

test('task status transitions update timestamps', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const { task } = await submitTask(env, {
    creatorId: 'creator-one',
    roleKey: 'data_quality_monitor',
    initiatorType: 'admin',
    initiatorId: 'admin-001',
    input: { checkType: 'full' },
  });
  
  assert.equal(task.startedAt, null);
  assert.equal(task.completedAt, null);
  
  await updateTaskStatus(env, task.id, 'running');
  const running = await getTask(env, task.id);
  assert.ok(running?.startedAt);
  assert.equal(running?.status, 'running');
  
  await updateTaskStatus(env, task.id, 'completed', { result: 'success' });
  const completed = await getTask(env, task.id);
  assert.ok(completed?.completedAt);
  assert.equal(completed?.status, 'completed');
  assert.deepEqual(completed?.result, { result: 'success' });
});

test('task run tracking records execution audit trail', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const { task } = await submitTask(env, {
    creatorId: 'creator-one',
    roleKey: 'data_quality_monitor',
    initiatorType: 'admin',
    initiatorId: 'admin-001',
    input: { checkType: 'full' },
  });
  
  const runId = await startTaskRun(env, task.id, 1);
  assert.ok(runId);
  
  await completeTaskRun(env, runId, { findings: [] }, {
    provider: 'mock',
    model: 'test-model',
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.001,
  });
  
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  const run = db.tables.agent_task_runs!.find(r => r.id === runId);
  assert.equal(run?.status, 'completed');
  assert.equal(run?.provider, 'mock');
  assert.equal(run?.input_tokens, 100);
  assert.equal(run?.estimated_cost_usd, 0.001);
});

test('failed task runs record error messages', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const { task } = await submitTask(env, {
    creatorId: 'creator-one',
    roleKey: 'data_quality_monitor',
    initiatorType: 'admin',
    initiatorId: 'admin-001',
    input: { checkType: 'full' },
  });
  
  const runId = await startTaskRun(env, task.id, 1);
  await failTaskRun(env, runId, 'Database connection timeout');
  
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  const run = db.tables.agent_task_runs!.find(r => r.id === runId);
  assert.equal(run?.status, 'failed');
  assert.equal(run?.error_message, 'Database connection timeout');
});

test('data quality findings are recorded with severity levels', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  const findingId = await recordDataQualityFinding(env, {
    creatorId: 'creator-one',
    taskId: null,
    findingType: 'duplicate_content',
    severity: 'warning',
    resourceType: 'content_item',
    resourceId: 'content-001',
    details: { duplicateCount: 2 },
    suggestedAction: 'Review duplicates',
    reviewedAt: null,
    reviewedBy: null,
    resolution: null,
  });
  
  assert.ok(findingId);
  
  const findings = await listDataQualityFindings(env, 'creator-one');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.findingType, 'duplicate_content');
  assert.equal(findings[0]!.severity, 'warning');
});

test('data quality check detects duplicate content', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  // Add duplicate content items
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  db.tables.content_items!.push(
    { id: 'item-1', creator_id: 'creator-one', external_id: 'yt-abc123', title: 'Recipe 1', rights_status: 'public_metadata' },
    { id: 'item-2', creator_id: 'creator-one', external_id: 'yt-abc123', title: 'Recipe 1 Duplicate', rights_status: 'public_metadata' },
    { id: 'item-3', creator_id: 'creator-one', external_id: 'yt-def456', title: 'Recipe 2', rights_status: 'unknown_rights' },
  );
  
  const { findings, summary } = await runDataQualityCheck(env, 'creator-one');
  
  assert.ok(findings.length > 0);
  assert.ok(summary.total > 0);
  
  assert.ok(findings.length > 0);
  assert.ok(summary.total > 0);
  
  // Should find duplicate
  const duplicateFinding = findings.find(f => f.findingType === 'duplicate_content');
  assert.ok(duplicateFinding);
  assert.equal(duplicateFinding?.severity, 'warning');
  
  // Should find incomplete rights
  const rightsFinding = findings.find(f => f.findingType === 'incomplete_rights');
  assert.ok(rightsFinding);
  assert.equal(rightsFinding?.severity, 'error');
});

test('tenant isolation prevents cross-creator access', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  // Add another creator
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  db.tables.creators!.push({ id: 'creator-two', slug: 'other-creator', name: 'Other Creator', category: 'cooking', status: 'active' });
  
  // Submit task for creator-one
  const { task } = await submitTask(env, {
    creatorId: 'creator-one',
    roleKey: 'data_quality_monitor',
    initiatorType: 'admin',
    initiatorId: 'admin-001',
    input: { checkType: 'full' },
  });
  
  // List tasks for creator-two should not include creator-one's task
  const tasksForTwo = await listTasks(env, { creatorId: 'creator-two' });
  assert.equal(tasksForTwo.length, 0);
  
  // List tasks for creator-one should include the task
  const tasksForOne = await listTasks(env, { creatorId: 'creator-one' });
  assert.equal(tasksForOne.length, 1);
  assert.equal(tasksForOne[0]!.id, task.id);
});

test('data quality findings are scoped by creator', async () => {
  const env = createEnv();
  await seedTestData(env);
  
  // Add findings for two creators
  const db = env.DB as unknown as ReturnType<typeof createMockDb>;
  db.tables.data_quality_findings!.push(
    { id: 'finding-1', creator_id: 'creator-one', finding_type: 'duplicate_content', severity: 'warning', resource_type: 'content_item', resource_id: 'item-1', details_json: '{}', created_at: new Date().toISOString() },
    { id: 'finding-2', creator_id: 'creator-two', finding_type: 'missing_metadata', severity: 'info', resource_type: 'content_item', resource_id: 'item-2', details_json: '{}', created_at: new Date().toISOString() },
  );
  db.tables.creators!.push({ id: 'creator-two', slug: 'other-creator', name: 'Other Creator', category: 'cooking', status: 'active' });
  
  const findingsForOne = await listDataQualityFindings(env, 'creator-one');
  assert.equal(findingsForOne.length, 1);
  assert.equal(findingsForOne[0]!.findingType, 'duplicate_content');
  
  const findingsForTwo = await listDataQualityFindings(env, 'creator-two');
  assert.equal(findingsForTwo.length, 1);
  assert.equal(findingsForTwo[0]!.findingType, 'missing_metadata');
});
