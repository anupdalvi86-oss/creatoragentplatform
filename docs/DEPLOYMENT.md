# Cloudflare deployment

## Local database

Run `npm run db:migrate` then `npm run db:seed`. The seed inserts two demo tenants, six platform-authored sample ideas for the cooking tenant, and a second-tenant isolation sentinel. It is idempotent. `npm run dev` runs Wrangler on 8787 and Vite on 5173. Open `/creator/<slug>` for the creator-facing page and `/admin` for its operator workspace. On localhost the admin UI creates a localhost-only owner session automatically; `ADMIN_DEV_TOKEN` in ignored `.dev.vars` remains an explicit fallback.

## Production prerequisites

1. Create a Cloudflare D1 database named `creator-agent-db`, replace the placeholder `database_id` in `wrangler.jsonc`, and apply `npm run db:migrate:remote`.
2. Configure a Cloudflare Access application for `/admin*` and `/api/admin*`. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as Worker secrets and insert allowed operator email/role rows into `admin_users`. The Worker verifies the Access JWT signature, audience, issuer, expiry and admin row on every admin API call.
3. Set a strong `SESSION_SECRET` through `wrangler secret put SESSION_SECRET`. Production requests fail closed without it. `APP_ENV` is `production` in checked-in configuration; local dev explicitly overrides it.
4. Review creator authorization, source rights, branding, privacy notice, data retention, custom domain and legal disclosures before publishing.
5. Optional: set `OPENAI_API_KEY`, `AI_PRIMARY=openai`, model IDs and `AI_PRICING_JSON` with verified rates. Set `YOUTUBE_API_KEY` for official metadata ingestion. Configure `AGENT_REACH_URL` only if an authorized external bridge is operated.
6. Optional semantic search: create a Vectorize index matching the embedding model dimensions, then add a `vectorize` binding named `VECTOR` to `wrangler.jsonc`. Set `AI_EMBEDDING_MODEL` and a matching price entry. D1 retrieval works without it.
7. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; then deploy with `npm run deploy`. Verify tenant isolation and Access policy on the deployed hostname.

Secrets belong in Worker secret bindings, not `wrangler.jsonc`, Git, logs or browser code. Local `.dev.vars` and `.env` are ignored. The checked-in D1 ID is a placeholder and must be replaced before a real deploy.
The Worker has a per-session request limit for mutable consumer routes. Configure Cloudflare WAF or equivalent edge abuse controls for production because a new anonymous session can reset that local allowance.

## Onboarding and another vertical

The admin UI can create another **cooking** creator without cloning the codebase. Add reviewed source content, adjust branding and gates, test the creator slug, then attach a verified domain after production configuration. The current consumer UI is cooking-specific. A fitness, education, parenting or travel product needs its own React views, domain tools, safety rules, evaluation cases and entitlements; register those modules before allowing the category in creator creation. The shared tenant, AI, source, usage, research, analytics and commercial layers remain reusable.
