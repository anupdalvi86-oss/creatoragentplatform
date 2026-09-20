# Creator Agent Platform

A multi-tenant Cloudflare Worker and React PWA foundation. The cooking workspace is a reusable creator product surface backed by tenant-scoped content, research, planning, and monetization modules.

## Run locally

Requires Node 22+ and npm. From the repository root:

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://127.0.0.1:5173/creator/<slug>` for a creator-facing product page, or use `/?creator=<slug>` as the query-string equivalent. Open `/admin` for the operator UI. Local admin now bootstraps a localhost-only owner session automatically; an `ADMIN_DEV_TOKEN` in `.dev.vars` remains available for explicit token-based access. The local server defaults to mock AI and a local-only signed session secret; do not reuse those defaults in production.

```bash
npm test
npm run smoke             # with npm run dev:api running locally
npm run lint
npm run typecheck
npm run build
npm run db:migrate:remote  # only after real D1 configuration
npm run deploy             # only after deployment setup and review
```

`npm run build` performs a Vite build and Wrangler dry run. It does not publish. See [deployment](docs/DEPLOYMENT.md) before a live deploy.

## Repository map

| Path | Purpose |
|---|---|
| `src/client` | Consumer PWA and protected operator UI |
| `src/server/worker.ts` | Tenant and admin HTTP routes |
| `src/server/agent.ts` | Cooking agent, tools, prompt version and execution caps |
| `src/server/ai.ts` | Provider-independent routing, cost ceiling and fallback |
| `src/server/retrieval.ts` | Tenant-scoped retrieval and optional Vectorize |
| `src/server/domain.ts` | Deterministic cooking, entitlements and revenue calculations |
| `src/server/research.ts` | Creator Scout and optional research adapters |
| `src/server/youtube.ts` | Official YouTube metadata ingestion |
| `migrations`, `seed` | D1 schema and illustrative demo data |
| `tests` | Isolation, grounding, finance, gating, fallback and ingestion tests |

## What works now

- Runtime creator config and tenant-scoped content, with a second seeded tenant to exercise isolation.
- Mobile-first cooking PWA, installable shell, content search, source pages, Can I Make This, substitutions, grounded source cards, structured ingredient parsing from explicit public descriptions, scaled ingredient display and clearable adult kitchen preferences.
- Optional OpenAI Chat Completions adapter; mock fallback; explicit model pricing required before paid calls. Source metadata is sent with `store: false`.
- Creator-grounded dinner and lunchbox plan previews, meal replacement, deterministic grocery aggregation, saved plans/lists and ideas, checkbox persistence, server-side free/premium gates and signed adult sessions.
- Browser speech recognition where supported, two-use voice trial, server-side allowance and text fallback.
- Protected admin API/UI for cooking creator setup, branding, agent tools/model policy, gates, content review and authorized metadata import, YouTube ingestion, Scout decisions, affiliate links and metrics.
- Creator onboarding with a persisted Creator URL and a three-stage Scout flow: research creator, understand audience/content, and discover product opportunities. Manual observations are labelled inferred; official facts retain source, date and confidence.
- Creator Scout with manual facts, official YouTube channel facts, optional Agent Reach bridge, provenance and reviewable ProductSpec. The Content tab can also import public YouTube video metadata directly from a channel URL when no API key is configured.
- Safe affiliate redirects, click events, pending revenue records, AI usage and product metrics.

## What is still external or limited

The local product is complete for the reusable cooking workflow and creator research handoff. Production still requires deployment configuration and external account decisions: creator authorization, verified domains, live AI/YouTube credentials, Vectorize (optional), speech provider, payment account, affiliate agreements, and sponsor integration. Checkout and automatic premium grants remain provider adapters. Scout opportunity and ProductSpec outputs are reviewable hypotheses; they do not invent audience metrics. Other verticals need their own UX and tool modules. See the [implementation plan](docs/IMPLEMENTATION_PLAN.md) for the remaining production path.

## Handoff guide

1. Architecture and trade-offs: [ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Data model and provenance: [DATA_MODEL.md](docs/DATA_MODEL.md).
3. Agent and model configuration: [AGENT_RUNTIME.md](docs/AGENT_RUNTIME.md).
4. Scout, YouTube and Agent Reach: [CREATOR_SCOUT.md](docs/CREATOR_SCOUT.md).
5. Free/premium gates, affiliates and revenue: [MONETIZATION.md](docs/MONETIZATION.md).
6. D1 setup, credentials, Cloudflare Access and deployment: [DEPLOYMENT.md](docs/DEPLOYMENT.md).
7. Known limitations and next milestones: [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

For another cooking creator, create a creator in `/admin`, add its Creator URL, then use the Scout tab to research the profile, record audience/content observations, and generate a reviewable opportunity and ProductSpec. Add approved content via an official YouTube channel or authorized metadata import. Imports start in review; an operator must inspect rights and metadata before marking them ready. Activation requires ready authorized, uploaded, or licensed content. The same Worker and PWA serve every slug. For another vertical, add a vertical-specific interface and tool definitions before enabling that category; see [architecture](docs/ARCHITECTURE.md).
