# Selected specialist agents and delivery roadmap

This is the **requested scope**, not an inventory of deployed services. A role means an owned task contract, inputs/outputs, permission boundaries and tests; it does not require a separate server or a distinct LLM. "Partial" means an existing feature can be reused but is not a registered autonomous specialist. "New" means no corresponding implementation exists. Hermes engineering roles are separate from the customer-facing Worker. See [handoff](HERMES_HANDOFF.md) for the current checkout and [runtime](AGENT_RUNTIME.md) for exact limitations.

## Creator content and knowledge

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Creator Scout | Partial | Extend sourced research and reviewable opportunity/spec; no invented audience facts or automatic launch. |
| YouTube Ingestion | Partial | Idempotent metadata import exists; add approved caption intake only with owner authorization. |
| Instagram Ingestion | New | Connect authorized professional creator accounts; no unrestricted scraping or assumed transcript access. |
| Transcription | New | Process creator-supplied media or authorized caption exports with timestamps/language; draft pending review. |
| Translation | New | Produce reviewable language variants tied to original transcript segments. |
| Recipe Extraction | Partial | Expand explicit-description ingredient parsing into reviewed structured recipes, not imagined video steps. |
| Content Librarian | New | Deduplicate, tag and organize tenant content as reversible drafts. |
| Rights Reviewer | New | Flag missing/ambiguous rights evidence; humans decide authorization and publication. |
| Source Verifier | Partial | Check every generated assertion against approved source IDs and provenance. |
| Content Repurposing | New | Draft creator-approved derivatives; no automatic posting. |
| SEO/Metadata | New | Suggest titles, descriptions and tags for approval. |

## Customer-facing product

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Cooking Assistant | Partial | Expose existing grounded `canMake` flow as an observable task/role without breaking the consumer API. |
| Ingredient Substitution | Partial | Extend deterministic labelled alternatives; no unsupported creator or allergy claims. |
| Meal Planner | Partial | Reuse source-grounded plan preview and persistence with entitlement checks. |
| Shopping List | Partial | Reuse deterministic quantity aggregation and saved checked state. |
| Pantry Assistant | Partial | Refine Can I Make This matching for available ingredients and constraints. |
| Voice Assistant | Partial | Browser STT/text fallback exists; provider-backed transcription/TTS needs a separate plan and gates. |
| Personalization | Partial | Use consented adult preferences only, with tenant/session isolation. |
| Learning Coach | New | Create source-linked lesson drafts and progress only after approved teaching content exists. |
| Support Assistant | New | Answer product FAQs; escalate account, billing and rights decisions to a human. |

## Product development through Hermes

These are **engineering workflows**, not public API roles. Implement as scoped Hermes task instructions/automation over a feature branch, not as write-capable public Worker endpoints.

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Product Strategist | Partial | Turn reviewed Scout facts and product feedback into prioritized hypotheses. |
| Feature Designer | Partial | Convert approved opportunities into an acceptance-tested spec; do not auto-implement. |
| UI/UX Designer | New | Audit journeys, produce design proposals and accessible implementation notes for approval. |
| Frontend Developer | New | Implement one approved UI change in a feature branch with evidence/screenshots. |
| Backend Developer | New | Implement one approved API/data change with migrations and tests. |
| Workflow Tester | Partial | Extend existing smoke checks to browser E2E for consumer/admin journeys and mobile sizes. |
| Evaluation Agent | Partial | Extend `evals/cooking.json` and model-quality/grounding checks for each new product role. |
| Release Agent | New | Prepare release notes, migration order and verification checklist; never push/deploy autonomously. |

## Shared operations

| Role | Status | First useful deliverable and boundary |
|---|---|---|
| Orchestrator | New | Route an authorized task to an allowlisted role, persist state and enforce approval gates. |
| Model Router | Partial | Reuse `ai.ts` provider policies, fallback and cost ceiling; Hermes model routing is separate. |
| Cost Monitor | Partial | Use `ai_requests`/`ai_usage` to report model/transcription budgets and unpriced calls. |
| Data Quality Monitor | New | Detect stale, duplicate, incomplete or unsourced tenant records without auto-publishing fixes. |

## Explicit exclusions

Do **not** create Code Reviewer or Regression Tester as standalone roles; existing code reviews and regression tests remain ordinary quality gates. Do **not** implement any of the previously proposed Growth and Commercial agents (Audience Insights, Experiment Planner, Campaign Assistant, Affiliate Assistant, Conversion Analyst, Pricing Analyst, Revenue Reconciliation). Also exclude Reliability Monitor, Security Reviewer, Privacy Reviewer and Incident Assistant as standalone roles. Baseline security, privacy, quality, testing and operational safety are still mandatory engineering requirements, not optional agent features. Existing commercial code remains in the repository; this initiative does not remove it.

## Implementation order and definition of done

1. **Foundation:** An admin-scoped task/run model, role registry, idempotency key, creator predicates, bounded execution, structured outcomes, audit trail, failure/retry policy, and one reversible draft-only Data Quality or Content Librarian task. Test authorization, cross-tenant isolation, duplicate delivery, failure and budget caps. Do not seed 32 names as if implemented.
2. **Authorized content:** Human-supplied media/caption intake with rights evidence; transcription as a background job; review UI; then extraction, translation, source/rights checks, librarian, metadata and repurposing drafts. Add platform connectors individually after verifying available permissions. A transcript is never consumer-visible until approved.
3. **Customer roles:** Refactor existing cooking tools into registered bounded capabilities first, then add the genuinely new Learning Coach and Support Assistant. Preserve deterministic calculations, current routes and entitlements. Add source-grounded evaluations per role.
4. **Engineering roles:** Define reusable Hermes instructions for strategy/spec/design/development/testing/release preparation. Start on branches, give inspectable diffs, and require owner approval before merge/push/deploy. Add real browser journey tests for Workflow Tester.
5. **Operations:** Add measured cost, provider routing and data-quality feedback loops. Keep human sign-off for external side effects.

Each slice is done only when it has a working trigger, an observable result, a documented permission boundary, tests for success/failure/tenant isolation, a cost ceiling if paid APIs are used, and no accidental change to existing consumer behavior. For a Worker deployment, verify the Cloudflare account's chosen queue/workflow/storage bindings and pricing before provisioning. A role listed here is not "deployed" until these criteria pass in the target environment.
