# Data model

All tenant-owned tables carry `creator_id`. IDs are opaque strings. D1 migrations define exact SQL, constraints and indexes. JSON columns contain validated configuration and snapshots, never an excuse to omit tenant predicates.

## Core

`creators` holds slug, category, status, brand, agent/model and monetization configuration. `creator_domains` maps verified hosts. `creator_features` holds feature switches. `admin_users` holds Cloudflare Access identity and role.

`content_sources` holds ingestion cursor/status/rights and provider details. `content_items` holds title, description, original URL, publication date, type, thumbnail, structured metadata, provenance, confidence, rights and processing state. `content_tags` and `content_embeddings` support retrieval. A creator-scoped unique source key makes ingestion idempotent.

`agents` and `agent_tools` configure role, prompt version, enabled tools and budgets. `ai_requests` and `ai_usage` record task, policy, provider, model, latency, token counts, estimated cost and status.

## People and access

`users` represents an adult-owned pseudonymous session or future account. `user_preferences` contains diet, equipment, family size and child age ranges. `plans`, `entitlements`, `feature_gates`, `usage_limits` and `user_entitlements` implement configurable access. `experiments` and `experiment_assignments` persist variants.

## Cooking

`meal_plans` and `meal_plan_items` persist selected creator content and scaled servings. `shopping_lists` and `shopping_list_items` persist deterministic totals and checked state. The list references the source plan.

## Commercial and operations

`events` holds privacy-conscious product events. `affiliate_links` contains approved destination, campaign and placement; `affiliate_clicks` records click IDs. `campaigns` and `campaign_events` record sponsored exposure. `revenue_events` records source, gross, fees, refunds, direct costs, net, currency, status and external transaction ID. Clicks never imply revenue.

## Creator Scout

`creator_facts` stores type/value/source/source URL/retrieval date/confidence/verification status. `research_runs` stores provider outcomes. `product_opportunities` and `product_specs` store hypotheses, evidence links, version and review status. `UNKNOWN` remains distinct from `NO`; dates are mandatory for external facts.

## Ownership and deletion

All public queries are scoped by resolved creator. User-owned records are additionally scoped by a server-issued signed session ID. Admin operations require explicit tenant scope and role. Deletion can cascade per creator after a separate audited admin operation; this MVP exposes no destructive tenant deletion endpoint.
