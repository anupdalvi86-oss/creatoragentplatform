PRAGMA foreign_keys = ON;

-- These roles now have safe handlers. External-provider roles still return an
-- explicit integration-required result when credentials or rights evidence is
-- absent, but they must be runnable and observable in the task system.
UPDATE agent_roles
SET enabled=1
WHERE role_key IN (
  'transcription', 'translation', 'rights_reviewer', 'voice_assistant',
  'learning_coach', 'support_assistant'
);
