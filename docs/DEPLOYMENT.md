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

Migration `0003_agent_tasks.sql` now provides the [catalog](AGENT_CATALOG.md)'s narrow task/run foundation behind existing admin authentication. The current release executes the deterministic Data Quality Monitor and a reversible Content Librarian preview; the Admin Operations panel exposes roles, tasks and findings. Before provisioning async resources, confirm Cloudflare account plan/bindings and choose Workflows for durable multi-step work, Queues for buffering/fan-out, and a suitable authorized media storage/transcription service if needed. No queue, Workflow, Instagram, upload bucket or STT provider is configured in `wrangler.jsonc` today. Add bindings and additive D1 migrations in reviewed changes; test retry/idempotency, rights and tenant isolation locally/staging before production. Draft/review gates apply to new creator content before public use, not routine customer responses. Keep Railway, Cloudflare and social-platform secrets in their respective secret stores and never paste them into Telegram.

## Onboarding and another vertical

The admin UI can create another **cooking** creator without cloning the codebase. Add reviewed source content, adjust branding and gates, test the creator slug, then attach a verified domain after production configuration. The current consumer UI is cooking-specific. A fitness, education, parenting or travel product needs its own React views, domain tools, safety rules, evaluation cases and entitlements; register those modules before allowing the category in creator creation. The shared tenant, AI, source, usage, research, analytics and commercial layers remain reusable.
