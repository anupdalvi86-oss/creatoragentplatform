# Hermes handoff: current context and working agreement

Snapshot: 2026-09-20. Verify the checkout and live services again before acting; this file is not a credentials store or a substitute for inspecting code.

## Where everything lives

- GitHub repository: `anupdalvi86-oss/creatoragentplatform`; local checkout in this conversation: `/Users/anup.dalvi/CreatorAgentPlatform`. The Hermes Telegram session reported cloning it into `/data/CreatorAgentPlatform` on Railway. Confirm that path and its branch in the current Hermes session before using it; a container filesystem may not be durable.
- Production Cloudflare Worker/PWA: <https://creator-agent-platform.anupdalviind.workers.dev>. A public HTTP response was verified on 2026-09-20; that does not validate admin Access, secrets, D1 contents, model calls, or individual workflows.
- Hermes dashboard: <https://hermes-agent-production-f50d.up.railway.app/sessions>; Telegram bot is an engineering interface. The creator-facing PWA is **not** hosted by Hermes. The last observed main commit was `9155d8d` (`Improve portal planning and grocery workflows`); check `git log` and `git status` rather than assuming it is still current.
- A parallel Codex task previously pushed and deployed that commit. The Hermes screenshot reported a clean clone/install/typecheck/test/lint/build with **14 tests** but expressly no push or deploy. Those checks are historical, not validation of future changes.
- Hermes had intermittent provider errors/rate limits. Kimi was used as primary in the observed setup. Merely adding OpenRouter does not create failover; configure and verify a fallback in Hermes independently. Do not expose credentials in Telegram or logs. The product Worker currently has an OpenAI-compatible adapter and mock fallback; Hermes provider configuration does not configure the product's AI calls.

## Code map and present behavior

- `src/client/App.tsx`, `AdminApp.tsx`: cooking PWA and operator interface. `src/server/worker.ts`: consumer/admin routes, gates, sessions and tenant resolution.
- `src/server/agent.ts`: fixed cooking prompt/tool registry and bounded `canMake`. `src/server/ai.ts`: OpenAI Chat Completions-compatible adapter, model policy, cost limit, timeout and deterministic mock fallback. `src/server/retrieval.ts`: tenant/rights-scoped retrieval, optional Vectorize.
- `src/server/domain.ts`: deterministic cooking operations. `src/server/research.ts`: Creator Scout with manual/official YouTube facts, optional external bridge and reviewable ProductSpec. `src/server/youtube.ts`: video **metadata** ingestion, not media/transcript downloading; its `TranscriptProvider` is an unused future interface.
- `migrations/`: D1 schema; `seed/demo.sql`: illustrative demo data, **not** real creator-authored recipes. `tests/`, `evals/`, `scripts/smoke.ts`: current checks. `wrangler.jsonc`: Worker, D1 and model vars; secrets are external. `npm run build` is a dry-run bundle; only `npm run deploy` publishes.
- Existing `agents` and `agent_tools` rows do not imply a generic multi-agent dispatcher. Admin edits the creator cooking agent; runtime tool names are fixed in `worker.ts` and `agent.ts`. No agent task queue, durable orchestration, transcript store, Instagram integration, browser E2E suite, or autonomous code-changing service is in this repository yet.

## Scope and boundaries

The owner's selected roles and explicit exclusions are in `AGENT_CATALOG.md`. Separate two execution planes: product agents run behind the Worker with creator-scoped permissions and review; engineering agents work on Git branches through Hermes and must never receive general production powers. Make the first implementation an end-to-end, small vertical slice, not 32 placeholder agents. Use idempotent tasks, an explicit state machine, retries and budgets. Human review gates rights, publishing, production migrations, and release.

Use authorized creator uploads/exported captions first for transcripts. Public YouTube metadata is not permission to download captions or media. Instagram needs an approved account connection and a validated access path; do not scrape around platform restrictions. Record language, source URL, time offsets, rights basis, provenance, review state, and failure reason. Keep draft text out of consumer retrieval until approved. Add an async mechanism (e.g. Cloudflare Workflows for multi-step jobs and Queues for fan-out) only after confirming account capabilities and cost. A separate transcription service may be needed for audio; decide after measuring workloads rather than assuming the Worker can process arbitrary video files.

Keep tenant predicates and origin/session/admin checks. Preserve deterministic cooking/grocery math and source-linked answers. Respect current safety rules: no fabricated creator statements, no allergy/medical assurances, no inferred audience numbers presented as facts, no invented payment or rights status. Minimize personal data in traces; report cost/latency and rate-limit behavior without logging prompts or keys.

## How to work through the backlog

1. **Foundation**: reconcile docs with code, design narrow role/task/run contracts, implement one authorized admin-triggered read-only or draft-only task end to end (prefer data-quality or content-librarian), with a creator-scoped API, idempotency, stored status, limits and tests. No remote migrations or deployment yet.
2. **Content**: authorized upload/caption intake, transcript pipeline and review, then extraction, translation, librarian, source and rights checks, YouTube/Instagram connector work only when access is available. Never equate importing metadata with transcription.
3. **Consumer**: register the existing cooking functions as role capabilities where useful, then implement the remaining approved customer roles behind gates and evaluations. Preserve current API contracts and mock fallback.
4. **Engineering**: use Hermes for UI/UX, feature planning, frontend/backend changes and workflow tests; require branch, diff, tests and owner review for every change. The release agent prepares checklists only.
5. **Operations**: add measured routing, cost and data-quality automation without giving any role implicit publishing, secrets or deployment privileges.

For each phase: inspect the actual code, propose a small acceptance-tested change, implement only that slice, run `npm run typecheck && npm test && npm run lint && npm run build`, and report the diff, migrations, risks and next phase. Ask the owner before pushing, running a **remote** D1 migration or deploying. Do not run all phases in a single Telegram request. The untracked local `test.tmp` observed in the Codex checkout belongs to the user; leave it alone if present in your checkout.

## First Telegram/console task

Paste the prompt below after the documentation is available in Hermes's checkout (by pulling an owner-approved push or otherwise making these files available). A local Codex edit does not automatically appear in Railway.

```text
In /data/CreatorAgentPlatform, first confirm pwd, git branch/status/log and that AGENTS.md plus docs/HERMES_HANDOFF.md and docs/AGENT_CATALOG.md are present. If they are absent or the checkout is stale, stop and tell me exactly what needs syncing; do not overwrite local changes. Read those files and the linked runtime, architecture, data-model, Scout and deployment docs. Compare them with the current code.

Implement only Phase 1 of the agent roadmap: one small, creator-scoped, admin-triggered draft-only agent task (prefer Data Quality or Content Librarian), with an explicit role registry, persistent task/run status, idempotency, bounded execution, error reporting, and tenant-isolation/permission tests. Reuse existing schema and APIs where appropriate; use a new additive migration for new tables. Do not build all roles at once, do not change commercial flows, and do not ingest unauthorized transcripts. Show a short design and acceptance criteria before editing. Work on a feature branch, preserve unrelated files, then run npm run typecheck, npm test, npm run lint and npm run build. Summarize changed files, tests, limitations and the next slice. Do not push, apply remote migrations, change secrets or deploy without my explicit approval.
```
