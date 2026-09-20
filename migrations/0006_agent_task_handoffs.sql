PRAGMA foreign_keys = ON;

-- Durable parent/child handoff records for sequential role workflows.
CREATE TABLE agent_task_handoffs (
  id TEXT PRIMARY KEY,
  parent_task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  child_task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  from_role_key TEXT NOT NULL,
  to_role_key TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('created','dispatched','completed','awaiting_review','failed','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_task_id, child_task_id),
  UNIQUE(parent_task_id, sequence_index)
);

CREATE INDEX agent_task_handoffs_by_child ON agent_task_handoffs(child_task_id,status);
CREATE INDEX agent_task_handoffs_by_parent ON agent_task_handoffs(parent_task_id,sequence_index);
