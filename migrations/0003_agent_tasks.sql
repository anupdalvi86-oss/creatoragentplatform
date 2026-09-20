PRAGMA foreign_keys = ON;

-- Agent task/run foundation for specialist-agent catalog
-- Supports: task submission, durable state, audit trail, idempotency, bounded execution

CREATE TABLE agent_roles (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL UNIQUE,
  role_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('content','consumer','engineering','operations')),
  enabled INTEGER NOT NULL DEFAULT 1,
  max_concurrency INTEGER NOT NULL DEFAULT 3,
  max_retries INTEGER NOT NULL DEFAULT 2,
  max_time_seconds INTEGER NOT NULL DEFAULT 300,
  max_tokens INTEGER NOT NULL DEFAULT 2000,
  max_cost_usd REAL NOT NULL DEFAULT 0.10,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  role_id TEXT NOT NULL REFERENCES agent_roles(id),
  initiator_type TEXT NOT NULL CHECK(initiator_type IN ('admin','user','system','webhook')),
  initiator_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('queued','running','awaiting_review','completed','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 5,
  started_at TEXT,
  completed_at TEXT,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(creator_id,role_id,idempotency_key)
);

CREATE INDEX agent_tasks_by_creator ON agent_tasks(creator_id,status,created_at);
CREATE INDEX agent_tasks_by_role ON agent_tasks(role_id,status,created_at);
CREATE INDEX agent_tasks_running ON agent_tasks(creator_id,role_id,status) WHERE status IN ('queued','running');

CREATE TABLE agent_task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  run_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd REAL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  result_json TEXT,
  error_message TEXT,
  UNIQUE(task_id,run_number)
);

CREATE INDEX agent_task_runs_by_task ON agent_task_runs(task_id,run_number);

CREATE TABLE agent_task_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  approver_type TEXT NOT NULL CHECK(approver_type IN ('admin','creator','system')),
  approver_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX agent_task_approvals_by_task ON agent_task_approvals(task_id,created_at);

-- Data Quality Monitor: findings from read-only quality checks
CREATE TABLE data_quality_findings (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  task_id TEXT REFERENCES agent_tasks(id),
  finding_type TEXT NOT NULL CHECK(finding_type IN ('duplicate_content','missing_metadata','stale_record','incomplete_rights','unsourced_claim','orphaned_embedding','schema_mismatch')),
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','error')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  suggested_action TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX data_quality_findings_by_creator ON data_quality_findings(creator_id,severity,created_at);
CREATE INDEX data_quality_findings_by_type ON data_quality_findings(finding_type,creator_id);

-- Content Librarian operations: reversible tagging/organization
CREATE TABLE content_librarian_operations (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id),
  task_id TEXT REFERENCES agent_tasks(id),
  operation_type TEXT NOT NULL CHECK(operation_type IN ('deduplicate','retag','reorganize','merge_tags','split_collection')),
  status TEXT NOT NULL CHECK(status IN ('preview','applied','reverted')),
  affected_content_ids TEXT NOT NULL DEFAULT '[]',
  before_state_json TEXT NOT NULL DEFAULT '{}',
  after_state_json TEXT NOT NULL DEFAULT '{}',
  applied_at TEXT,
  reverted_at TEXT,
  reverted_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX content_librarian_ops_by_creator ON content_librarian_operations(creator_id,status,created_at);

-- Seed the selected specialist roles (not the excluded ones)
INSERT INTO agent_roles (id, role_key, role_name, description, category, enabled, max_concurrency, max_retries, max_time_seconds, max_tokens, max_cost_usd, requires_approval) VALUES
-- Operations (foundation)
('role-dqm-001', 'data_quality_monitor', 'Data Quality Monitor', 'Detect stale, duplicate, incomplete or unsourced tenant records without auto-publishing fixes', 'operations', 1, 3, 2, 300, 2000, 0.05, 0),
('role-orc-001', 'orchestrator', 'Orchestrator', 'Route authorized tasks to allowlisted roles, persist state and enforce approval gates', 'operations', 1, 5, 3, 600, 4000, 0.10, 0),
-- Content
('role-lib-001', 'content_librarian', 'Content Librarian', 'Deduplicate, tag and organize tenant content as reversible drafts', 'content', 1, 2, 2, 300, 2000, 0.05, 1),
('role-trn-001', 'transcription', 'Transcription', 'Process creator-supplied media or authorized caption exports with timestamps/language', 'content', 0, 2, 2, 600, 4000, 0.10, 1),
('role-trs-001', 'translation', 'Translation', 'Produce reviewable language variants tied to original transcript segments', 'content', 0, 2, 2, 600, 4000, 0.10, 1),
('role-rgt-001', 'rights_reviewer', 'Rights Reviewer', 'Flag missing/ambiguous rights evidence; humans decide authorization', 'content', 0, 2, 1, 300, 2000, 0.05, 1),
-- Consumer (existing cooking roles registered)
('role-cok-001', 'cooking_assistant', 'Cooking Assistant', 'Grounded canMake flow with tenant-scoped retrieval', 'consumer', 1, 5, 2, 60, 1000, 0.03, 0),
('role-sub-001', 'ingredient_substitution', 'Ingredient Substitution', 'Deterministic labelled alternatives without unsupported claims', 'consumer', 1, 5, 1, 30, 500, 0.01, 0),
('role-pln-001', 'meal_planner', 'Meal Planner', 'Source-grounded plan preview and persistence with entitlement checks', 'consumer', 1, 3, 2, 120, 1500, 0.05, 0),
('role-gro-001', 'grocery_assistant', 'Grocery Assistant', 'Deterministic quantity aggregation and saved checked state', 'consumer', 1, 3, 1, 60, 1000, 0.02, 0),
('role-pan-001', 'pantry_assistant', 'Pantry Assistant', 'Can I Make This matching for available ingredients', 'consumer', 1, 3, 2, 120, 1500, 0.04, 0),
('role-voi-001', 'voice_assistant', 'Voice Assistant', 'Browser STT/text fallback with provider-backed transcription plan', 'consumer', 0, 2, 2, 60, 1000, 0.03, 0),
('role-prs-001', 'personalization', 'Personalization', 'Consented adult preferences with tenant/session isolation', 'consumer', 1, 3, 1, 60, 1000, 0.02, 0),
('role-lrn-001', 'learning_coach', 'Learning Coach', 'Source-linked lesson drafts after approved teaching content exists', 'consumer', 0, 2, 2, 300, 2000, 0.08, 1),
('role-sup-001', 'support_assistant', 'Support Assistant', 'Product FAQs with escalation for account/billing/rights', 'consumer', 0, 3, 2, 120, 1500, 0.04, 0)
ON CONFLICT(role_key) DO NOTHING;
