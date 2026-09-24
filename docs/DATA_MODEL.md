# Data model

All tenant-owned tables carry `creator_id`. IDs are opaque strings. D1 migrations define exact SQL, constraints and indexes. JSON columns contain validated configuration and snapshots, never an excuse to omit tenant predicates.

## Core

`creators` holds slug, category, status, brand, agent/model and monetization configuration. `creator_domains` maps verified hosts. `creator_features` holds feature switches. `admin_users` holds Cloudflare Access identity and role.

`content_sources` holds ingestion cursor/status/rights and provider details. `content_items` holds title, description, original URL, publication date, type, thumbnail, structured metadata, provenance, confidence, rights and processing state. `content_tags` and `content_embeddings` support retrieval. A creator-scoped unique source key makes ingestion idempotent.

`agents` and `agent_tools` configure role, prompt version, enabled tools and budgets. `ai_requests` and `ai_usage` record task, policy, provider, model, latency, token counts, estimated cost and status.

The original `agents` tables describe cooking configuration. Migrations `0003`–`0006` add separate creator-scoped specialist tasks, runs, approvals and handoffs. Transcript records are still not implemented. Put any future large media outside D1 and distinguish rights asserted from rights verified.


## People and access

`users` represents an adult-owned pseudonymous session or future account. `user_preferences` contains diet, equipment, family size and child age ranges. `plans`, `entitlements`, `feature_gates`, `usage_limits` and `user_entitlements` implement configurable access. `experiments` and `experiment_assignments` persist variants.

## Cooking

`meal_plans` and `meal_plan_items` persist selected creator content and scaled servings. `shopping_lists` and `shopping_list_items` persist deterministic totals and checked state. The list references the source plan.

## Commercial and operations

`events` holds privacy-conscious product events. Creator PWA `page_view` events include the normalized PWA screen/path, allowlisted UTM attribution, referrer hostname, coarse browser/OS/device, viewport, language and Cloudflare country/region/city where supplied. The existing signed first-party creator session ID supports approximate unique-visitor counts; its cookie lasts one year. Raw IP addresses, raw user-agent strings, full referrer URLs and arbitrary query strings are not stored. The protected creator metrics response aggregates all-time and last-30-day views/visitors plus daily visits, traffic sources/campaigns, location, devices and pages. The admin portal itself is not instrumented as a consumer page. `affiliate_links` contains approved destination, campaign and placement; `affiliate_clicks` records click IDs. `campaigns` and `campaign_events` record sponsored exposure. `revenue_events` records source, gross, fees, refunds, direct costs, net, currency, status and external transaction ID. Clicks never imply revenue.

## Creator Scout

`creator_facts` stores type/value/source/source URL/retrieval date/confidence/verification status. `research_runs` stores provider outcomes. `product_opportunities` and `product_specs` store hypotheses, evidence links, version and review status. `UNKNOWN` remains distinct from `NO`; dates are mandatory for external facts.

## Ownership and deletion

All public queries are scoped by resolved creator. User-owned records are additionally scoped by a server-issued signed session ID. Admin operations require explicit tenant scope and role. An owner-only admin route can delete a workspace and its tenant-scoped rows; it must also remove fitness records before deleting the creator.

All new tasks, runs, transcripts and approval reads/writes must include `creator_id` predicates and the appropriate operator/user authority. Use uniqueness constraints for retries and source deduplication. Avoid storing provider keys, complete prompts, or unnecessary personal data in run records. See [catalog](AGENT_CATALOG.md) for the rollout and [handoff](HERMES_HANDOFF.md) for deployment separation.

## Fitness (migration 0007)

`fitness_creator_members`, `fitness_users`, `fitness_profiles` and `fitness_entitlements` separate creator and audience identity and access from cooking. `fitness_programs` and `fitness_program_exercises` store creator-authored schedules and catalog references with draft, pending review, approved and published states. `fitness_workouts`, `fitness_reminders`, `fitness_challenges`, `fitness_challenge_members` and `fitness_posts` support engagement and moderation. Every lookup and mutation includes `creator_id`; audience data also includes `user_id`. Optional body measurements exist only in the audience's profile JSON and are absent from creator review and aggregate responses. No checkout integration issues fitness entitlements automatically.
