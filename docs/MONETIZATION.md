# Entitlements, experiments and revenue

`feature_gates` are tenant-owned D1 configuration. `useFeature` in the Worker is authoritative. It uses an atomic `usage_limits` increment for free allowances; a hidden button alone never grants access. The demo seeds five AI text requests per day, two lifetime browser voice interactions, a two-day meal plan preview and a gated grocery list. Operators can change gate values in `/admin` or through the protected gates API. Premium is an internal entitlement for now; a payment provider is not connected.

The grocery gate appears after a real plan and shows ingredient count and a small preview. Pricing and checkout are deliberately absent until an offering, payment provider and terms are approved. `EntitlementProvider` currently has an internal D1 implementation. Future Stripe/RevenueCat adapters should accept verified signed events and write `user_entitlements`; they must not infer access from client state.

Affiliate links are created by operators and redirected through `/go/:creator/:link`. The Worker rejects non-HTTPS or mismatched hosts, records a click ID, and returns 302. Clicks never count as conversions. Consumer placements must disclose affiliate or sponsored relationships. Campaign and revenue tables are tenant-owned. Manual revenue API entries are restricted to `pending`; confirmed or paid financial events need a verified provider feed or audited approval workflow. The operator metrics endpoint reports confirmed revenue only, so absent data stays absent.

`events` contains feature-level, privacy-conscious events. `ai_requests` and `ai_usage` record provider, model, policy, latency, tokens, status and estimated cost. The admin dashboard groups cost by feature and flags unpriced embedding calls. Estimates depend on the operator-maintained model price schedule. Do not use these estimates as invoices.

Protected experiment routes can create two to four gate variants for `AI_TEXT`, `AI_VOICE` or `MEAL_PLAN`. The Worker assigns each adult session once, persists the assignment, and applies the variant's free allowance server-side. The operator UI now supports creating drafts and changing experiment status; billing terms and provider-confirmed conversion events are still required before activating commercial pricing experiments.

## Scope of the specialist-agent initiative

The owner excluded all Growth and Commercial specialist agents from the current [catalog](AGENT_CATALOG.md). Existing gates, analytics, affiliate and revenue code remain in place; the new orchestrator must not automate pricing, payment status, campaigns, affiliate claims or sponsor activation. Cost monitoring in scope is limited to safe provider/resource usage and budget reporting, not revenue optimization. Production release still requires a human check of current entitlements and commercial behavior.
