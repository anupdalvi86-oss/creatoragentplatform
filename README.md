# Creator Agent Platform

A multi-tenant Cloudflare Worker and React PWA foundation. The cooking workspace is a reusable creator product surface backed by tenant-scoped content, research, planning, and monetization modules.

For Hermes/Telegram development, start at [AGENTS.md](AGENTS.md) and the [Hermes handoff](docs/HERMES_HANDOFF.md). The [selected agent catalog](docs/AGENT_CATALOG.md) lists proposed specialists, current implementation status, explicit exclusions and delivery order. These documents are **plans**, not claims that every agent is deployed.

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
- Mobile-first cooking PWA, installable shell, content search, source pages, Can I Make This, pantry-to-recipe matching, substitutions, grounded source cards, structured ingredient parsing from explicit public descriptions, scaled ingredient display, clearable adult kitchen preferences, and per-serving recipe nutrition estimates with an unsaved ingredient calculator.
- Optional OpenAI Chat Completions adapter; mock fallback; explicit model pricing required before paid calls. Source metadata is sent with `store: false`.
- Creator-grounded dinner and lunchbox plan previews, meal replacement, deterministic grocery aggregation, saved plans/lists and ideas, checkbox persistence, server-side free/premium gates and signed adult sessions.
- Browser speech recognition where supported, two-use voice trial, server-side allowance and text fallback.
- Protected admin API/UI for cooking creator setup, branding, agent tools/model policy, gates, content review and authorized metadata import, YouTube ingestion, Scout decisions, affiliate links and metrics.
- Creator onboarding with a persisted Creator URL and a three-stage Scout flow: research creator, understand audience/content, and discover product opportunities. Manual observations are labelled inferred; official facts retain source, date and confidence.
- Creator Scout with manual facts, official YouTube channel facts, optional Agent Reach bridge, provenance and reviewable ProductSpec. The Content tab can also import public YouTube video metadata directly from a channel URL when no API key is configured.
- Creator PWA visitor analytics with approximate unique visitors, daily views, referrer/campaign attribution, coarse device/browser and location breakdowns, and per-screen visits. Raw IP addresses and raw user-agent strings are not stored. Protected admin metrics also retain existing engagement, AI usage and revenue summaries.
- Safe affiliate redirects, click events, and pending revenue records.

## What is still external or limited

The cooking and Scout foundations exist, and a Cloudflare production URL is serving the PWA, but a public response does not verify all production integrations or creator authorization. Live AI/YouTube credentials, Access policy, authorized source content, optional Vectorize, speech provider, payments and agreements must be checked in the target account. Checkout and automatic premium grants remain provider adapters. Scout opportunity and ProductSpec outputs are reviewable hypotheses; they do not invent audience metrics. Other verticals need their own UX and tool modules. The 32 selected specialist roles now have typed handlers and onboarding fan-out, but provider integrations, rights approvals and target-environment verification remain pending; see the [catalog](docs/AGENT_CATALOG.md) and [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Handoff guide

1. Architecture and trade-offs: [ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Data model and provenance: [DATA_MODEL.md](docs/DATA_MODEL.md).
3. Agent and model configuration: [AGENT_RUNTIME.md](docs/AGENT_RUNTIME.md).
4. Scout, YouTube and Agent Reach: [CREATOR_SCOUT.md](docs/CREATOR_SCOUT.md).
5. Free/premium gates, affiliates and revenue: [MONETIZATION.md](docs/MONETIZATION.md).
6. D1 setup, credentials, Cloudflare Access and deployment: [DEPLOYMENT.md](docs/DEPLOYMENT.md).
7. Known limitations and next milestones: [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
8. Hermes checkout, production boundary and full Telegram instruction: [HERMES_HANDOFF.md](docs/HERMES_HANDOFF.md).
9. Selected roles, exclusions, status and phased definition of done: [AGENT_CATALOG.md](docs/AGENT_CATALOG.md).

For another cooking or fitness creator, paste a YouTube channel link into `/admin` and choose **Build PWA**. The setup creates or reuses the tenant and imports supported public metadata. Cooking setup submits the selected specialist handlers; fitness setup runs Scout and opens the dedicated program workflow. After setup, the portal can open a prefilled outreach email draft in the default mail app; the operator enters the creator's business email, reviews the draft and sends it manually. The portal does not send or store the email. Cooking engineering handlers produce review-only plans/checklists; they do not edit the repository, deploy, publish, change payments or invoke Hermes. YouTube imports up to 25 public metadata cards; Instagram and unsupported sources report the exact authorization/connector requirement. Transcripts, media and derived recipe steps still require creator authorization and review. Operator-supplied recipe metadata starts in review and must be inspected before it is marked ready. The same Worker serves every slug. Fitness uses its own PWA interface and tenant-scoped data; see [architecture](docs/ARCHITECTURE.md).

## Fitness PWA

The Build PWA form detects a YouTube channel's vertical from official public metadata when available. Mixed or unavailable signals require an explicit administrator choice. A fitness tenant has its own branded manifest, creator studio, program review/publishing flow, anonymous audience sessions, onboarding, routine matching, workout tracking, challenges and discussion. The creator must have a verified Cloudflare Access email membership to edit a program; operators can assign membership in the protected studio. A fitness user never shares a session or profile with a cooking user, even if other identifying details coincide.

The shared exercise catalog is bundled metadata from [free-exercise-db-with-videos](https://github.com/harshvishu/free-exercise-db-with-videos), preserving source IDs and provenance. The source describes code and exercise metadata as MIT licensed but discusses video rights separately. The product owner confirmed use of those videos in this app on 2026-09-25; see the [fitness media policy](docs/FITNESS_MEDIA_POLICY.md). This is an app-specific authorization, not independent verification of upstream rights. Video files are not downloaded or rehosted; playback is on demand from the source URLs. Browser reminders work while the app is open; background push delivery is not configured. Premium programs are server gated but no payment or entitlement grant flow has been added.
