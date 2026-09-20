# Selected specialist agents and delivery roadmap

This is the **requested scope** and now maps to 32 runnable role handlers behind the shared task contract. A role does not require a separate server or a distinct LLM. Handlers are deterministic and tenant-scoped where possible; provider-dependent roles return an explicit integration-required/review result until credentials and rights evidence exist. Hermes engineering roles are separate from the customer-facing Worker. See [handoff](HERMES_HANDOFF.md) for the current checkout and [runtime](AGENT_RUNTIME.md) for exact limitations.

## Creator content and knowledge

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Creator Scout | Implemented handler | Runs sourced research and creates a reviewable opportunity/spec; no invented audience facts or automatic launch. |
| YouTube Ingestion | Implemented handler | Imports public metadata idempotently; authorized caption intake remains separate. |
| Instagram Ingestion | Implemented handler | Validates the integration boundary and returns an explicit credential requirement; no unrestricted scraping. |
| Transcription | Implemented handler | Packages creator-supplied transcript/caption exports with timestamps/language for review; no arbitrary media download. |
| Translation | Implemented handler | Validates timestamped source segments and packages supplied translations for review. |
| Recipe Extraction | Implemented handler | Returns explicit structured metadata for review, never imagined video steps. |
| Content Librarian | Partial | Produces a reversible duplicate/tag/review preview; applying changes still needs an explicit approval operation. |
| Rights Reviewer | Implemented handler | Flags missing/ambiguous rights evidence; humans decide authorization and publication. |
| Source Verifier | Implemented handler | Checks source IDs against tenant-scoped, rights-allowed content. |
| Content Repurposing | Implemented handler | Drafts creator-approved derivatives; no automatic posting. |
| SEO/Metadata | Implemented handler | Suggests titles, descriptions and tags for approval. |

## Customer-facing product

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Cooking Assistant | Implemented handler | Exposes the grounded `canMake` flow as an observable task without changing the consumer API. |
| Ingredient Substitution | Implemented handler | Uses deterministic labelled alternatives; no unsupported creator or allergy claims. |
| Meal Planner | Implemented handler | Produces a source-grounded plan preview with tenant-scoped results. |
| Shopping List | Implemented handler | Reuses deterministic quantity aggregation through the Grocery Assistant role. |
| Pantry Assistant | Implemented handler | Matches available ingredients against tenant content and constraints. |
| Voice Assistant | Implemented handler | Accepts browser/provider transcript handoff and reports missing speech integration explicitly. |
| Personalization | Implemented handler | Persists consented adult preferences only, with tenant/session isolation. |
| Learning Coach | Implemented handler | Creates source-linked lesson drafts after approved content exists. |
| Support Assistant | Implemented handler | Answers product FAQs and escalates account, billing and rights decisions. |

## Product development through Hermes

These are **engineering workflows**, not public API roles. Implement as scoped Hermes task instructions/automation over a feature branch, not as write-capable public Worker endpoints.

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Product Strategist | Implemented handler | Turns supplied evidence into prioritized hypotheses. |
| Feature Designer | Implemented handler | Converts an approved problem into acceptance criteria; does not auto-implement. |
| UI/UX Designer | Implemented handler | Produces journey audits and accessible implementation notes for approval. |
| Frontend Developer | Implemented handler | Produces a scoped feature-branch implementation plan and verification evidence. |
| Backend Developer | Implemented handler | Produces a scoped API/data plan with migration and test order. |
| Workflow Tester | Implemented handler | Produces the workflow matrix and release-gate commands. |
| Evaluation Agent | Implemented handler | Produces grounding, rights, isolation, latency and cost evaluation plans. |
| Release Agent | Implemented handler | Prepares release notes, migration order and verification checklist; never deploys autonomously. |

## Shared operations

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Orchestrator | Implemented handler | Routes an authorized task to an allowlisted child role and persists its task state. |
| Model Router | Implemented handler | Reports `ai.ts` provider policy, fallback and cost ceiling; Hermes routing remains separate. |
| Cost Monitor | Implemented handler | Reports `ai_requests` and task-run budgets, including unpriced calls. |
| Data Quality Monitor | Implemented foundation | Runs creator-scoped duplicate, metadata, rights and orphan checks, records findings and audit usage without auto-publishing fixes. |

## Explicit exclusions

Do **not** create Code Reviewer or Regression Tester as standalone roles; existing code reviews and regression tests remain ordinary quality gates. Do **not** implement any of the previously proposed Growth and Commercial agents (Audience Insights, Experiment Planner, Campaign Assistant, Affiliate Assistant, Conversion Analyst, Pricing Analyst, Revenue Reconciliation). Also exclude Reliability Monitor, Security Reviewer, Privacy Reviewer and Incident Assistant as standalone roles. Baseline security, privacy, quality, testing and operational safety are still mandatory engineering requirements, not optional agent features. Existing commercial code remains in the repository; this initiative does not remove it.

## Implementation order and definition of done

1. **Shared foundation and handlers (complete):** An admin-scoped task/run model, role registry, idempotency key, creator predicates, bounded execution, structured outcomes, audit trail and failure/retry policy. All 32 selected non-excluded roles now have a typed Worker handler; Data Quality and Content Librarian are proven end to end. Test authorization, cross-tenant isolation, duplicate delivery, failure and budget caps. A handler is not the same as a live external provider: credentials and rights gates remain explicit.
2. **Parallel tracks after the contract stabilizes:** (A) authorized content intake/transcription/extraction/translation/review/connectors; (B) existing cooking roles plus Learning Coach and Support Assistant; (C) Hermes engineering workflows, UI/UX and browser journey tests; (D) routing, cost and data-quality feedback. Use separate branches/worktrees or sessions for independent tasks, coordinate migrations/shared interfaces and integrate each tested role as it becomes ready. These are release checkpoints, not a requirement to finish one entire track before starting another.
3. **Approval by effect, not by every response:** Normal tenant-scoped answers, internal reports, tests and suggestions can run when their permissions and tests pass. Human authorization/review is required before new transcripts or derivatives become public creator content, for claims of rights, payments/commercial actions, and for remote migrations, publishing or production deployments. Build safe defaults and explicit status for unavailable platform credentials, without blocking unrelated roles.

Each slice is done only when it has a working trigger, an observable result, a documented permission boundary, tests for success/failure/tenant isolation, a cost ceiling if paid APIs are used, and no accidental change to existing consumer behavior. For a Worker deployment, verify the Cloudflare account's chosen queue/workflow/storage bindings and pricing before provisioning. A role listed here is not "deployed" until these criteria pass in the target environment. Do not label all content agents "draft-only": draft/review state applies to new unapproved creator material, not routine customer answers or read-only operations.
