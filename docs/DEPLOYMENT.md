# Cloudflare deployment

## Local database

Run `npm run db:migrate` then `npm run db:seed`. The seed inserts two demo tenants, six platform-authored sample ideas for the cooking tenant, and a second-tenant isolation sentinel. It is idempotent. `npm run dev` runs Wrangler on 8787 and Vite on 5173. Open `/creator/<slug>` for the creator-facing page and `/admin` for its operator workspace. On localhost the admin UI creates a localhost-only owner session automatically; `ADMIN_DEV_TOKEN` in ignored `.dev.vars` remains an explicit fallback.

## Production prerequisites

1. Confirm that `wrangler.jsonc` points at the intended Cloudflare account and `creator-agent-db` D1 database. A concrete database ID is checked in; **do not assume** the target account's schema, migration history or seed contents from that ID. Inspect before applying any remote migration. For a demo only, load the reviewed sample tenant and content with `XDG_CONFIG_HOME=.wrangler/config npx wrangler d1 execute creator-agent-db --remote --file=seed/demo.sql`; production creator data should instead be loaded through the admin workflow after rights review.
2. Configure a Cloudflare Access application for `/admin*` and `/api/admin*`. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as Worker secrets and insert allowed operator email/role rows into `admin_users`. The Worker verifies the Access JWT signature, audience, issuer, expiry and admin row on every admin API call.
3. Set a strong `SESSION_SECRET` through `wrangler secret put SESSION_SECRET`. Production requests fail closed without it. `APP_ENV` is `production` in checked-in configuration; local dev explicitly overrides it.
4. Review creator authorization, source rights, branding, privacy notice, data retention, custom domain and legal disclosures before publishing.
5. Optional: set `OPENAI_API_KEY`, `AI_PRIMARY=openai`, model IDs and `AI_PRICING_JSON` with verified rates. Set `YOUTUBE_API_KEY` for official metadata ingestion. Configure `AGENT_REACH_URL` only if an authorized external bridge is operated.
6. Optional semantic search: create a Vectorize index matching the embedding model dimensions, then add a `vectorize` binding named `VECTOR` to `wrangler.jsonc`. Set `AI_EMBEDDING_MODEL` and a matching price entry. D1 retrieval works without it.
7. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; then deploy with `npm run deploy`. Verify tenant isolation and Access policy on the deployed hostname.

Secrets belong in Worker secret bindings, not `wrangler.jsonc`, Git, logs or browser code. Local `.dev.vars` and `.env` are ignored. Confirm the checked-in D1 ID matches the intended account before any remote command.
The Worker has a per-session request limit for mutable consumer routes. Configure Cloudflare WAF or equivalent edge abuse controls for production because a new anonymous session can reset that local allowance.

## Observed deployments versus verified capabilities

As of 2026-09-20 the public PWA responds at <https://creator-agent-platform.anupdalviind.workers.dev>. The previously reported Cloudflare deployment came from a separate Codex task; a Hermes Telegram run only cloned, installed and performed a **dry-run build**, without pushing or deploying. Public HTTP 200 and a passing build do not prove D1 migrations, Access policies, creator authorization, live paid AI, YouTube credentials, or premium/payment integrations. Verify each in the target account. The Railway Hermes dashboard at <https://hermes-agent-production-f50d.up.railway.app/sessions> is an engineering agent, not the Worker deployment. A Kimi/OpenRouter fallback in Hermes is unrelated to the Worker `AI_PRIMARY`/`AI_FALLBACK` settings and secrets.

## Specialist-agent rollout

Migrations `0003`–`0006` now provide the [catalog](AGENT_CATALOG.md)'s task/run foundation, handoff lineage and all 32 role handlers behind existing admin authentication. `wrangler.jsonc` configures `creator-agent-task-queue`, its dead-letter queue, `AgentTaskWorkflow`, and an hourly scheduled Worker trigger. Chained tasks are durable Workflow instances; standalone tasks use the Queue consumer. Creator onboarding now submits all 32 selected handlers idempotently. Deterministic product/operations roles can complete immediately; content and engineering effects produce explicit review/integration states. Engineering handlers are planning/checklist outputs only and do not edit, deploy or invoke Hermes. Instagram, upload storage and STT providers remain separate integrations. Test retry/idempotency, rights, approvals and tenant isolation locally/staging before production. Keep Railway, Cloudflare and social-platform secrets in their respective secret stores and never paste them into Telegram.

## Onboarding and another vertical

The admin UI can create another **cooking or fitness** creator without cloning the codebase. Add reviewed source content, adjust branding and gates, test the creator slug, then attach a verified domain after production configuration. Fitness has separate React views, program APIs and audience data. Education, parenting and travel still need vertical-specific modules before activation. The shared tenant, AI, source, usage, research, analytics and commercial layers remain reusable.

## Fitness release requirements

Apply additive migration `0007_fitness.sql` to the target D1 database only after owner approval. A Cloudflare Access application must cover the creator's studio API path and supply the configured JWT audience; creator email memberships then control tenant access. The owner confirmed exercise-video use in this app on 2026-09-25; see [fitness media policy](FITNESS_MEDIA_POLICY.md). This approval does not cover bulk rehosting or unrelated media. Browser reminders and opted-in creator follow-ups run only while the PWA is open; background push is not configured. Premium programs are gated on the server through fitness-specific entitlements, but no checkout or grant integration exists. Confirm the target domain, Access policy and migration state before deployment.
