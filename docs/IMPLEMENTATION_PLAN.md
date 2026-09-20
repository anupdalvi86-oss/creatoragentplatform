# Implementation plan

## Milestone 1 — grounded cooking slice

Create the D1 schema, two tenant records, sample rights-safe cooking content, tenant API, content search, cooking tool registry, Can I Make This endpoint and React PWA. Add an OpenAI-compatible provider behind an AI router with mock fallback. Validate provenance and isolation. Run tests, lint, typecheck and build.

## Milestone 2 — planning and monetization gate

Add adult-owned preferences, deterministic creator-grounded meal planning, servings and grocery aggregation. Persist plans and lists by tenant and signed session. Enforce server-side allowances and show a contextual grocery gate after a useful plan preview. Keep offerings configurable. Run the same quality gates.

## Milestone 3 — voice

Add speech provider interfaces, browser STT option, text fallback, voice usage accounting and server-side gate. Add TTS only when a provider is configured. Run quality gates.

## Milestone 4 — Creator Scout

Add provider contracts for official APIs, manual import, web research and optional Agent Reach. Store facts with source, date, confidence and VERIFIED/INFERRED/UNKNOWN. Generate reviewable opportunities, monetization hypotheses and ProductSpec; never auto-publish. Run quality gates.

## Milestone 5 — commercial and analytics

Add validated affiliate redirects and click records, campaign events, revenue ledger, privacy-conscious events and operator metrics. Only provider-confirmed transactions count as revenue. Run quality gates.

## Acceptance criteria

Each milestone must remain tenant-isolated and usable without unavailable integrations. `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` must pass. A production deployment additionally requires D1, Access, secrets, legal review of creator assets/content and payment decisions.

## Current status (updated 2026-09-20)

| Slice | Implemented locally | Remaining for production |
|---|---|---|
| Grounded cooking | Tenant config, seeded rights-safe catalog, search, Can I Make This, source links, deterministic fallback, configurable OpenAI adapter, optional Vectorize | Creator-authorized content, live AI key and evaluated model, deployed Vectorize index |
| Planning | Adult preferences, dinner/lunchbox plans and replacement, serving scale, grocery aggregation, saved ideas with a free limit, server gates and previews | Checkout, premium grants from verified provider events, broader authorized recipe corpus |
| Voice | Browser STT trial and text fallback, provider interfaces, duration event | Cross-browser STT/TTS service, real audio cost accounting, hands-free playback |
| Creator Scout | Creator URL onboarding, three-stage research UX, manual and official YouTube facts, optional Agent Reach bridge, audience/content observations, reviewable hypotheses and ProductSpec | Authorized bridge operation, broader vetted research providers, human validation |
| Commercial/analytics | Affiliate redirects/clicks, campaigns, sponsor event endpoint, pending ledger, product and AI cost metrics, persisted gate experiments and operator controls | Provider-confirmed conversion/revenue feed, billing, production dashboard QA |

The MVP coding slice exists and the PWA is reachable at the Cloudflare URL listed in [deployment](DEPLOYMENT.md). Production integration/readiness still needs account-backed verification, rights review and workflow checks; a reachable shell or Wrangler dry run is not proof of those capabilities. No external metric is fabricated when integrations are absent.

The operator UI now supports branding, Creator URL onboarding, reviewed content metadata, authorized source import, agent policy and tool changes, gate changes, and the three-stage Scout/ProductSpec review. A rights assertion entered by an operator is not independent proof of creator authorization.

## Decisions requiring owner input before production

Creator authorization and branding, domain ownership, official source IDs/API access, AI account and budgets, payment provider/prices, privacy notice and retention, affiliate agreements, Voice STT/TTS vendor, Cloudflare account resources. Defaults are local/demo only.

## Selected specialist-agent program (new; not yet implemented)

The owner chose the 32 roles and explicit exclusions in [AGENT_CATALOG.md](AGENT_CATALOG.md). Treat them as a **backlog**, not a request to scaffold 32 empty agents. The next implementation starts with a creator-scoped admin task/run foundation and one reversible draft-only role, then authorized content/transcripts and review, then customer roles, Hermes engineering workflows and operational feedback. See the catalog for role-by-role status and acceptance criteria and the [Hermes handoff](HERMES_HANDOFF.md) for a copyable first task. New work must use additive migrations, protect existing routes and pass the full local quality gate. Provisioning remote infrastructure, pushing and deploying require separate approval.

## Latest observed verification (2026-09-20)

The last observed `main` commit was `9155d8d`; a parallel task reported full checks and Cloudflare deployment. Hermes subsequently reported 14/14 tests, typecheck, lint and a dry-run build on its clone, with **no** push/deploy. A public HTTP response from the Cloudflare PWA was verified on 2026-09-20. Re-run the checks and verify the production D1/Access/secrets and end-to-end workflows before asserting the next release is ready. Historical statements elsewhere in this plan describe older implementation passes, not current deployment state.
