# Agent handoff for Creator Agent Platform

Read `README.md` and `docs/HERMES_HANDOFF.md` first. Then read `docs/AGENT_CATALOG.md`, `docs/ARCHITECTURE.md`, `docs/AGENT_RUNTIME.md`, `docs/DATA_MODEL.md`, `docs/CREATOR_SCOUT.md`, and `docs/DEPLOYMENT.md` before changing agent behavior or infrastructure. The checked-in code and migrations are authoritative when a document is stale; report discrepancies and update the docs in the same change.

This is a multi-tenant cooking PWA and Cloudflare Worker backed by D1. Hermes is an external **engineering assistant**, not the deployed consumer runtime. A creator-configured cooking agent and Creator Scout exist, but the proposed specialist-agent dispatcher and background jobs do not. Never claim a catalog entry is live merely because it appears in documentation or in the `agents` table.

Work in small, reviewable phases from `docs/AGENT_CATALOG.md`. Before edits, inspect the branch, worktree, latest commit, migrations, existing tests, and requested scope. Preserve unrelated user changes (including any untracked files). Create a feature branch for implementation, use additive D1 migrations, and keep creator isolation and rights checks on every read/write. Don't insert transcripts, generated content, or rights assertions into consumer-visible records without authorized input and human review. Don't let an LLM approve payments, publication, source rights, or deployments.

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` for code changes; `build` is a Wrangler **dry run**, not a deployment. Report tests and any skipped checks accurately. Do not push, apply remote migrations, alter Railway/Cloudflare secrets, or deploy without explicit owner approval for that action. Never print or commit credentials. The model credentials for Hermes/Railway and for this Cloudflare Worker are separate.

The excluded roles are listed in `docs/AGENT_CATALOG.md`. Do not implement them under this initiative. Do not add new agents for commercial optimization or automatic release authority.
