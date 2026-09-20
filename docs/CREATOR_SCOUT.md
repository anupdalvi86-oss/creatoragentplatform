# Creator Scout and content research

Creator onboarding stores a Creator URL on the tenant. The admin Scout tab then presents three explicit stages: (1) research the creator from official or supplied sources, (2) understand audience and content using dated facts plus labelled inferred observations, and (3) discover product opportunities as a reviewable hypothesis. `POST /api/admin/scout/:creatorId` accepts the URL and optional manually reviewed facts, runs providers independently, records provider outcomes and facts, and returns a `ProductOpportunity`, `ProductSpec` and `MonetizationHypothesis`. An unavailable provider does not stop the others. Specs stay `pending_review` until an admin changes their review status through the protected API. Review does not deploy anything.

Facts always carry type, value, source, source URL where verified, retrieval time, confidence and `VERIFIED`, `INFERRED` or `UNKNOWN`. `UNKNOWN` is stored as unknown; it is not interpreted as a negative answer. Official YouTube facts are dated public metadata, including the rounded public subscriber count only when the API supplies it. Scout never invents audience metrics. Opportunity confidence and commercial options are explicitly hypotheses.

## Providers

- `ManualImportProvider`: structured operator input with schema validation.
- `YouTubeOfficialProvider`: channel ID URLs through the official YouTube Data API, when `YOUTUBE_API_KEY` is configured.
- `AgentReachProvider`: an **optional HTTPS bridge contract**, not a Worker dependency. The bridge must run [Agent Reach](https://github.com/Panniantong/agent-reach) outside the Worker with only authorized/public sources and return `{ "facts": [...] }` using the fact schema. Set `AGENT_REACH_URL` and optionally `AGENT_REACH_TOKEN`. This repository does not install, invoke or depend on Agent Reach's CLI in consumer requests.
- `WebResearchProvider`: explicit empty adapter until an approved research source is added.

The Agent Reach repository describes a local CLI and access methods that may require credentials. The bridge must not bypass access controls or turn unsupported scraping into a production data source. Test provider output and rights before using it for a public product.

## YouTube ingestion

`POST /api/admin/youtube/:creatorId/ingest` accepts a YouTube channel URL or a `UC...` channel ID. With `YOUTUBE_API_KEY`, each call uses official `channels.list` → uploads playlist → `playlistItems.list` → `videos.list`, processes at most 25 videos, persists the next-page cursor and reuses one canonical source per channel. Without an API key, it resolves the public channel page and reads the public RSS feed, importing up to 25 public video titles, descriptions, thumbnails and links. Retry the same endpoint after failure; prior metadata is updated idempotently. `content_sources` records status and last error. Video files and unauthorized transcripts are never downloaded. `TranscriptProvider` is a separate interface for future creator-authorized captions.

The metadata is marked `public_metadata` and links to the original video. When a creator's public description contains an explicit `Ingredients:` section, the importer parses the published quantities into a structured ingredient list. Those values remain public-description metadata: the original video is still the source of truth for instructions, substitutions and food safety. Videos without an explicit ingredient section remain source cards with clearly labelled ingredient hints or an unavailable state. Grocery lists are enabled only for structured ingredients with published quantities. Optional embedding failure leaves the D1 metadata usable. Configure `YOUTUBE_API_KEY` as a Worker secret when official channel statistics, duration and pagination are required.

## Planned content specialists (not connected yet)

The [catalog](AGENT_CATALOG.md) adds authorized transcription, translation, recipe extraction, librarian, rights/source checks, repurposing, SEO suggestions and an Instagram connector. `TranscriptProvider` in `src/server/youtube.ts` is only an interface; no caption download, media transcription, Instagram authorization flow or transcript review pipeline is implemented. Start with creator-supplied uploads or authorized caption exports. YouTube caption download needs suitable owner/editor authorization, not the public metadata API key. Instagram media access needs a connected, permitted account; do not equate a public URL with permission to download/process all media or assume an audio-transcript endpoint exists. Validate platform-specific capabilities when implementing each adapter.

Every transcript/extraction must carry original URL/source ID, authorization basis, timestamps, language, version and review state. Keep unreviewed text out of consumer retrieval and do not label generated recipe steps as creator statements. Scout/ProductSpec and derivative content remain drafts until reviewed; no agent autonomously accepts rights or publishes. See [handoff](HERMES_HANDOFF.md) for the staged implementation.
