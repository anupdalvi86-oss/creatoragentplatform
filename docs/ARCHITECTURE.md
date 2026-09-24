# Creator Agent Platform architecture

## Scope and assumptions

The first release is a reusable cooking workspace with illustrative seed content and tenant-isolated creator onboarding. Creator URL, research facts, audience/content observations, and ProductSpec outputs are persisted per tenant. A creator-owned domain, verified YouTube channel, commercial terms, payment account, and AI credentials are external configuration points. No generated ProductSpec is deployed automatically.

## Runtime

- **Consumer:** React, TypeScript and Vite PWA. A creator slug selects brand, features and content at runtime. Cooking has its own UI and workflows; another vertical implements different screens and tools using the same API contracts.
- **API:** one Cloudflare Worker with small route modules. No service mesh or background fleet. D1 stores transactional data. Vectorize is an optional retrieval accelerator; D1 text/metadata retrieval is authoritative fallback. R2 is reserved for authorized uploads.
- **AI:** one `AIProvider` interface with OpenAI-compatible HTTP and deterministic mock adapters. `AIRouter` applies task policy, timeout, fallback and cost limits. It records usage without logging prompts or secrets. Generated text is never described as the creator's words.
- **Sources:** `ContentItem` records rights status, original URL, provenance and processing state. Retrieval filters by creator and publication rights before it reaches an agent. Answers carry content IDs, source links, confidence and warnings. Unsupported questions produce an explicit evidence warning.
- **Operations:** native D1 migrations, seeded demo data, Wrangler environments, structured logs, unit/integration tests and a production build.

## Specialist-agent topology

The [agent catalog](AGENT_CATALOG.md) splits **product roles** (tenant-scoped consumer/content tasks) from **engineering roles** (review-only planning handlers whose repository work remains in Hermes on Git branches). Do not connect Telegram/Hermes directly to customer secrets, entitlement decisions, or arbitrary public Worker tool execution. The product's `agents` table remains cooking-agent configuration; the separate creator-scoped specialist task runtime owns onboarding fan-out and fixed cooking tools remain the consumer execution path.

The first product slice should add an authenticated task submission path, persisted task/run lifecycle, allowlisted role/tool registry and a useful read-only or reversible operation. Once those interfaces are tested, separate content, customer-facing, engineering and operations tracks can advance concurrently and integrate independently. Authorized content intake can fan out through a queue into a durable transcript/extract/review workflow; reviewed source records then feed tenant-scoped retrieval. Queue and Workflow bindings are now checked in; upload storage and dedicated audio processing remain design options. Add them only after verifying workload, Cloudflare account resources, permissions and cost. A failed/retried job must not duplicate content or bypass review. Draft/review requirements attach to new unapproved creator content, not ordinary bounded customer answers.

Hermes can propose specs, edit a branch and run checks; a human approves rights, publishing, remote schema changes and releases. These are two execution planes sharing a codebase, not one unrestricted agent swarm. See [handoff](HERMES_HANDOFF.md) for the observed deployment and [runtime](AGENT_RUNTIME.md) for existing caps.

## Boundaries

| Boundary | Responsibility | Current implementation / extension |
|---|---|---|
| Reusable platform | tenant resolution, content, retrieval, AI router, tool registry, entitlements, usage, analytics, redirects, research contracts | Shared Worker modules and D1 tables |
| Creator layer | brand, domain, agent policy, rights, feature flags, offerings | Data in `creators` and related tables; no fork for creator #2 |
| Cooking vertical | ingredient matching, Can I Make This, plans, servings, groceries, preferences | Separate cooking domain module and React views |
| Creator Scout | provenance-aware facts, opportunities, reviewable ProductSpec | Internal API and adapter contracts; never consumer runtime dependency |
| Agent Reach | optional research adapter | Disabled unless explicitly configured; provider failure is nonfatal |
| Voice | STT/TTS/realtime contracts and usage gate | Browser speech input where supported; server interface can accept a configured provider later |
| Monetization | server-side feature gates, safe affiliate redirects, revenue events | Internal entitlement provider and D1 ledger; checkout adapter is unconfigured |

## Request path and isolation

The API resolves the creator slug before a tenant operation. Every read/write includes `creator_id` in the SQL predicate; resource IDs alone are insufficient. Public tenant selection is by slug or verified domain, never an arbitrary `creator_id` supplied by a client. Admin routes require an authenticated operator and explicit creator scope. D1 foreign keys and unique composite indexes protect cross-tenant references where possible. Tests exercise cross-tenant access.

## First cooking flow

`/api/:slug/config` → branded home → `/content` search → `/can-make` parses ingredients and constraints → tenant-scoped structured/text retrieval (plus Vectorize when configured) → cooking tools compute ingredient availability and substitutions → `AIRouter` optionally phrases the grounded result → response with original source links. Deterministic results remain available if AI or vectors fail. Illustrative recipes are clearly marked as sample content.

## Agent execution

An agent definition lists enabled tools. Registry checks vertical, entitlement, input schema and budget before execution. Runtime caps tool calls, execution time, output tokens and estimated cost. The model may propose language or plans but cannot decide entitlements, calculate quantities, create financial events, or fabricate sources. Prompt templates are versioned in one module. Evaluation fixtures test grounding and forbidden claims.

## Security and privacy

Parameterized SQL, request validation, tenant predicates, same-origin mutation checks, secure cookies, rate limits and strict redirect hosts are required. Admin authentication uses Cloudflare Access JWT verification in deployment; a local development token is permitted only in local mode. Secrets live in Worker environment bindings. Adult-owned preferences are minimal; children have age ranges only and no accounts. Source text with unknown rights is not served to consumers. Logs exclude personal prompts and credentials.

## Trade-offs

The single Worker keeps deployment and tracing simple. It can be split only when traffic or ownership requires it. D1 full-text search is sufficient for the first small catalog and is the failure path for Vectorize. Browser speech recognition has uneven support, so typed input remains first-class. Payment and research adapters are intentionally replaceable; no checkout or scraping is represented as live without credentials and authorization. The initial mock AI creates deterministic wording from retrieved records and does not claim model reasoning.

The proposed many-role catalog should be delivered as a few tested workflows sharing infrastructure. One role per deployed service or per model key would add operational complexity without adding capability.

## Fitness vertical

Fitness uses the existing Worker and `creators` table with `category='fitness'`, a separate React view and tenant-specific manifest. Cooking routes reject fitness tenants; fitness routes reject cooking tenants. `/api/:slug/fitness/studio/*` requires a verified Cloudflare Access JWT mapped to `fitness_creator_members` or an operator role. Fitness audience cookies are signed with a fitness-specific scope and backed by `fitness_users`, separate from cooking `users`. The static shared exercise adapter retains catalog identifiers, metadata provenance and remote demonstration URLs. Program rows reference exercise identifiers instead of duplicating records. No new deployed specialist role or background infrastructure is introduced.
