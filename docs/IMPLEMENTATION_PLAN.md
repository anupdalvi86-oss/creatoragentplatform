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

The local MVP workflow is complete and hosted locally. Production readiness is now limited to account-backed integrations, deployment configuration, human review, and the production quality gate. No external metric is fabricated when those integrations are absent.

The operator UI now supports branding, Creator URL onboarding, reviewed content metadata, authorized source import, agent policy and tool changes, gate changes, and the three-stage Scout/ProductSpec review. A rights assertion entered by an operator is not independent proof of creator authorization.

## Decisions requiring owner input before production

Creator authorization and branding, domain ownership, official source IDs/API access, AI account and budgets, payment provider/prices, privacy notice and retention, affiliate agreements, Voice STT/TTS vendor, Cloudflare account resources. Defaults are local/demo only.

## Verification status after the latest implementation pass

The owner asked to skip test runs in this pass. The saved content migration applied locally, and type checking passed after the authorized import, campaign, and admin lifecycle edits. The full quality gate and browser review are still required before deployment. No deployment was attempted.
