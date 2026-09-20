PRAGMA foreign_keys = ON;

-- Every selected, non-excluded role has a runnable bounded handler. External
-- integrations return an explicit awaiting_review result until credentials and
-- creator authorization are present; they are not silently simulated.
INSERT INTO agent_roles (id, role_key, role_name, description, category, enabled, max_concurrency, max_retries, max_time_seconds, max_tokens, max_cost_usd, requires_approval) VALUES
('role-sct-001', 'creator_scout', 'Creator Scout', 'Run sourced creator research and produce a reviewable opportunity hypothesis', 'content', 1, 2, 2, 300, 2500, 0.10, 1),
('role-yti-001', 'youtube_ingestion', 'YouTube Ingestion', 'Import public YouTube metadata or authorized creator sources idempotently', 'content', 1, 2, 2, 300, 1500, 0.05, 0),
('role-igi-001', 'instagram_ingestion', 'Instagram Ingestion', 'Process authorized Instagram Professional account data only', 'content', 1, 1, 1, 300, 1500, 0.05, 1),
('role-rec-001', 'recipe_extraction', 'Recipe Extraction', 'Extract explicit structured metadata without inventing video steps', 'content', 1, 2, 2, 180, 2000, 0.05, 1),
('role-ver-001', 'source_verifier', 'Source Verifier', 'Verify claims against tenant-scoped rights-allowed source IDs', 'content', 1, 4, 1, 60, 1000, 0.02, 0),
('role-rpt-001', 'content_repurposing', 'Content Repurposing', 'Draft creator-approved derivatives without publishing them', 'content', 1, 2, 2, 300, 2500, 0.08, 1),
('role-seo-001', 'seo_metadata', 'SEO and Metadata', 'Suggest reviewable titles, descriptions and tags from approved content', 'content', 1, 3, 1, 120, 1500, 0.04, 1),
('role-ps-001', 'product_strategist', 'Product Strategist', 'Turn sourced evidence into prioritized product hypotheses', 'engineering', 1, 2, 2, 300, 2500, 0.08, 1),
('role-fd-001', 'feature_designer', 'Feature Designer', 'Convert an approved problem into an acceptance-tested feature draft', 'engineering', 1, 2, 2, 300, 2500, 0.08, 1),
('role-ux-001', 'ui_ux_designer', 'UI/UX Designer', 'Produce accessible journey audits and implementation notes', 'engineering', 1, 2, 2, 300, 2500, 0.08, 1),
('role-fe-001', 'frontend_developer', 'Frontend Developer', 'Prepare an approved frontend change plan with verification evidence', 'engineering', 1, 1, 1, 300, 2000, 0.05, 1),
('role-be-001', 'backend_developer', 'Backend Developer', 'Prepare an approved backend/data change plan with tests and migration order', 'engineering', 1, 1, 1, 300, 2000, 0.05, 1),
('role-wft-001', 'workflow_tester', 'Workflow Tester', 'Generate and run the platform workflow test matrix', 'engineering', 1, 2, 1, 300, 1500, 0.03, 0),
('role-eval-001', 'evaluation_agent', 'Evaluation Agent', 'Evaluate grounding, rights, isolation, latency and cost expectations', 'engineering', 1, 2, 1, 300, 1500, 0.03, 0),
('role-rel-001', 'release_agent', 'Release Agent', 'Prepare a release checklist without pushing or deploying autonomously', 'engineering', 1, 1, 1, 180, 1500, 0.03, 1),
('role-mr-001', 'model_router', 'Model Router', 'Report the configured provider route and bounded model policy', 'operations', 1, 4, 1, 60, 800, 0.01, 0),
('role-cm-001', 'cost_monitor', 'Cost Monitor', 'Report AI and specialist task cost, pricing gaps and usage warnings', 'operations', 1, 3, 1, 120, 1000, 0.02, 0)
ON CONFLICT(role_key) DO UPDATE SET enabled=1, description=excluded.description, requires_approval=excluded.requires_approval;
