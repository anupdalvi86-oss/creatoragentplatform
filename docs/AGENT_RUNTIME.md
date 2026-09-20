# Agent runtime and AI configuration

`src/server/agent.ts` owns versioned prompts and the tool registry. A creator's `agent_json.enabledTools` is checked before deterministic tools run. Execution is capped at four calls and ten seconds in the current cooking flow. SQL-backed entitlement decisions are made in the Worker, never by an LLM.

`src/server/ai.ts` routes CHEAP, STANDARD and REASONING policies to configured providers. `AI_PRIMARY=openai` uses OpenAI Chat Completions; `AI_FALLBACK=mock` yields a deterministic source-based answer if the primary fails. `AI_MODEL_CHEAP`, `AI_MODEL_STANDARD` and `AI_MODEL_REASONING` are environment configuration. Set `OPENAI_API_KEY` as a secret. Set `AI_PRICING_JSON` to your verified per-model USD per-million-token rates. Paid requests fail closed to mock if pricing is missing or the estimated upper bound exceeds the request's cost ceiling. The current defaults remain mock.

Example shape, using **placeholders**, not quoted vendor prices:

```json
{"your-standard-model":{"inputPerMillion":0.00,"outputPerMillion":0.00}}
```

The cooking flow retrieves tenant-owned, rights-allowed metadata first; deterministic code ranks ingredient and constraint matches and computes missing ingredients. The model can phrase the answer from a small source bundle, but cannot select a tenant, entitlement or payment status. The API response includes `sourceContentIds`, `label`, `aiGenerated`, confidence, warnings and full source cards. The consumer UI links back to the original URL. Illustrative samples are identified as such. If evidence is absent, the API says so.

`src/server/retrieval.ts` uses Vectorize only when a binding and an embedding key exist. It verifies every vector hit against D1 with `creator_id` and rights filtering. D1 retrieval remains available on vector or embedding failure. Embeddings can be indexed during official YouTube ingestion; unchanged content is skipped via checksum. Embedding usage with no configured rate is marked `unpriced` in `ai_requests`.

The provider interface currently has OpenAI and mock implementations. Gemini, DeepSeek and Moonshot adapters can implement the same `AIProvider` contract without changing cooking logic. Model quality should be chosen using source-grounded evaluations and measured latency/cost, not public benchmark rank alone.

## Evaluation

`tests/platform.test.ts` checks no unsupported substitution claim, provider fallback, and UNKNOWN research status. `tests/domain.test.ts` checks ingredient ranking, tool limits and tenant-bound SQL. With the local Worker running, `npm run eval` checks five API scenarios from `evals/cooking.json` for expected sources, required facts, forbidden claims, expected tools, response properties and latency. It is a regression gate, not a model-quality benchmark. Cost can be compared separately in the admin AI metrics after runs with a configured model and verified price schedule.
