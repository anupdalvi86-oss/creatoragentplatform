# Agent runtime and AI configuration

`src/server/agent.ts` owns versioned prompts and the tool registry. A creator's `agent_json.enabledTools` is checked before deterministic tools run. Execution is capped at four calls and ten seconds in the current cooking flow. SQL-backed entitlement decisions are made in the Worker, never by an LLM.

This is **not yet a general multi-agent runtime**. `worker.ts` validates a fixed set of five cooking tool names, `canMake` follows a specific retrieval/answer path, and admin editing selects the first agent for a creator. The `agents`/`agent_tools` schema can inform a future role registry but does not itself route tasks, execute other roles, or persist a multi-step run. The planned role contracts and status are in [AGENT_CATALOG.md](AGENT_CATALOG.md).

`src/server/ai.ts` routes CHEAP, STANDARD and REASONING policies to configured providers. `AI_PRIMARY=openai` uses OpenAI Chat Completions; `AI_FALLBACK=mock` yields a deterministic source-based answer if the primary fails. `AI_MODEL_CHEAP`, `AI_MODEL_STANDARD` and `AI_MODEL_REASONING` are environment configuration. Set `OPENAI_API_KEY` as a secret. Set `AI_PRICING_JSON` to your verified per-model USD per-million-token rates. Paid requests fail closed to mock if pricing is missing or the estimated upper bound exceeds the request's cost ceiling. The checked-in Worker selects OpenAI first and mock second; without a valid key, output is deterministic mock.

Example shape, using **placeholders**, not quoted vendor prices:

```json
{"your-standard-model":{"inputPerMillion":0.00,"outputPerMillion":0.00}}
```

The cooking flow retrieves tenant-owned, rights-allowed metadata first; deterministic code ranks ingredient and constraint matches and computes missing ingredients. The model can phrase the answer from a small source bundle, but cannot select a tenant, entitlement or payment status. The API response includes `sourceContentIds`, `label`, `aiGenerated`, confidence, warnings and full source cards. The consumer UI links back to the original URL. Illustrative samples are identified as such. If evidence is absent, the API says so.

`src/server/retrieval.ts` uses Vectorize only when a binding and an embedding key exist. It verifies every vector hit against D1 with `creator_id` and rights filtering. D1 retrieval remains available on vector or embedding failure. Embeddings can be indexed during official YouTube ingestion; unchanged content is skipped via checksum. Embedding usage with no configured rate is marked `unpriced` in `ai_requests`.

The provider interface currently has OpenAI and mock implementations. Gemini, DeepSeek and Moonshot adapters can implement the same `AIProvider` contract without changing cooking logic. Model quality should be chosen using source-grounded evaluations and measured latency/cost, not public benchmark rank alone.

Hermes on Railway is a separate **engineering environment**. A Kimi/OpenRouter key or fallback configured for Hermes does not make the Cloudflare consumer API use that provider. Product credentials belong in Worker secret bindings; Hermes credentials belong in its own environment. Neither agent system should print keys or silently switch billing accounts. The current Worker configuration names OpenAI as primary and mock as fallback; confirm actual secret availability before claiming live paid-model responses.

For new product tasks, implement an allowlisted role identifier, typed payload/result, creator and operator scope, idempotency key, queued/running/awaiting_review/completed/failed states where relevant, retry bounds, time/token/cost caps, approval events for high-impact effects and error codes. Persist source IDs and rights provenance, not raw prompts in logs. Validate the foundation with a useful read-only or reversible task; its result may be visible immediately to the authorized operator. A draft/review state is required for newly ingested creator content before public retrieval, not for every task or existing customer answer. Treat a missing transcript provider, unavailable queue or model rate limit as a visible task outcome, not proof of success. Keep external side effects out of retries unless idempotent.

## Evaluation

`tests/platform.test.ts` checks no unsupported substitution claim, provider fallback, and UNKNOWN research status. `tests/domain.test.ts` checks ingredient ranking, tool limits and tenant-bound SQL. With the local Worker running, `npm run eval` checks five API scenarios from `evals/cooking.json` for expected sources, required facts, forbidden claims, expected tools, response properties and latency. It is a regression gate, not a model-quality benchmark. Cost can be compared separately in the admin AI metrics after runs with a configured model and verified price schedule.

The selected Workflow Tester and Evaluation Agent are future specialized workflows on top of these checks. The owner explicitly excluded standalone Code Reviewer and Regression Tester roles; ordinary code review and regression tests still remain release gates.
