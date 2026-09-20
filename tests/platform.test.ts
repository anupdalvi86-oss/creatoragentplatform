import assert from 'node:assert/strict';
import test from 'node:test';
import { canMake } from '../src/server/agent';
import { generateAI } from '../src/server/ai';
import type { Env } from '../src/server/db';
import { discoverOpportunity, ManualImportProvider } from '../src/server/research';
import { durationMinutes, isYouTubeChannelRef, parsePublicFeed } from '../src/server/youtube';
import { getGateVariant } from '../src/server/experiments';

test('substitution makes no creator claim without source evidence', async () => {
  const db = { prepare() { return { bind() { return { async all() { return { results: [] }; } }; } }; } } as unknown as D1Database;
  const env = { DB: db } as Env;
  const result = await canMake(env, { id: 'one', category: 'cooking', agent: { enabledTools: ['searchCreatorKnowledge', 'findSubstitution'] } }, { goal: 'Can I replace cream?', ingredients: [], equipment: [], diet: [], familySize: 2 });
  assert.equal(result.label, 'GENERAL SUGGESTION');
  assert.equal(result.aiGenerated, false);
  assert.deepEqual(result.sourceContentIds, []);
  assert.match(result.answer, /no specific substitution .* mentioned by the chef/i);
});
test('unknown research facts remain unknown and do not become evidence', async () => {
  const fact = { type: 'has_app', value: null, source: 'manual review', retrievedAt: new Date().toISOString(), confidence: 0, verificationStatus: 'UNKNOWN' as const };
  const imported = await new ManualImportProvider().research({ creatorId: 'one', url: 'https://example.com', category: 'cooking', manualFacts: [fact] });
  assert.equal(imported[0]?.verificationStatus, 'UNKNOWN');
  const result = discoverOpportunity('one', 'cooking', imported);
  assert.deepEqual(result.opportunity.evidence, []);
  assert.equal(result.opportunity.confidence, 0.15);
  assert.equal(result.spec.reviewStatus, 'pending_review');
});
test('AI router falls back to deterministic provider when key is absent', async () => {
  const recorded: unknown[] = [];
  const db = { prepare(sql: string) { return { bind(...values: unknown[]) { return { sql, values }; } }; }, async batch(statements: unknown[]) { recorded.push(...statements); return []; } } as unknown as D1Database;
  const env = { DB: db, AI_PRIMARY: 'openai', AI_FALLBACK: 'mock', AI_MODEL_CHEAP: 'cheap', AI_MODEL_STANDARD: 'standard', AI_MODEL_REASONING: 'reasoning' } as Env;
  const result = await generateAI(env, { creatorId: 'one', feature: 'AI_TEXT', task: 'grounded', policy: 'STANDARD', prompt: 'source facts', fallback: 'source-based answer', maxTokens: 100, maxCostUsd: 1 });
  assert.equal(result.text, 'source-based answer');
  assert.equal(result.provider, 'mock');
  assert.equal(result.fallbackUsed, true);
  assert.equal(recorded.length, 2);
});
test('configured AI provider uses explicit rates, token cap and no storage', async () => {
  const previousFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => { sent = JSON.parse(String(init?.body)) as Record<string, unknown>; return new Response(JSON.stringify({ choices: [{ message: { content: 'Grounded source answer' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200 }); };
  try {
    const db = { prepare(sql: string) { return { bind(...values: unknown[]) { return { sql, values }; } }; }, async batch() { return []; } } as unknown as D1Database;
    const env = { DB: db, AI_PRIMARY: 'openai', AI_FALLBACK: 'mock', AI_MODEL_CHEAP: 'test-model', AI_MODEL_STANDARD: 'test-model', AI_MODEL_REASONING: 'test-model', AI_PRICING_JSON: JSON.stringify({ 'test-model': { inputPerMillion: 1, outputPerMillion: 2 } }), OPENAI_API_KEY: 'test-key' } as Env;
    const result = await generateAI(env, { creatorId: 'one', feature: 'AI_TEXT', task: 'grounded', policy: 'STANDARD', prompt: 'facts', fallback: 'fallback', maxTokens: 100, maxCostUsd: 0.01 });
    assert.equal(result.provider, 'openai');
    assert.equal(result.estimatedCostUsd, 0.0002);
    assert.equal(sent.store, false);
    assert.equal(sent.max_completion_tokens, 100);
  } finally { globalThis.fetch = previousFetch; }
});
test('YouTube duration metadata converts without downloading media', () => {
  assert.equal(durationMinutes('PT1H2M31S'), 63);
  assert.equal(durationMinutes('PT42S'), 1);
  assert.equal(durationMinutes('bad'), 0);
});
test('public YouTube RSS metadata is parseable without transcripts', () => {
  const videos = parsePublicFeed(`
    <feed>
      <entry>
        <yt:videoId>abc123</yt:videoId>
        <title><![CDATA[Paneer Dinner]]></title>
        <published>2026-09-20T12:00:00Z</published>
        <media:group>
          <media:description type="html"><![CDATA[Ingredients:\n- paneer - 200 g]]></media:description>
          <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg&amp;x=1" />
        </media:group>
      </entry>
    </feed>`);
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.id, 'abc123');
  assert.match(videos[0]?.description || '', /Ingredients/);
  assert.equal(videos[0]?.thumbnailUrl, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg&x=1');
});
test('creator onboarding recognizes channel URLs but not individual videos', () => {
  assert.equal(isYouTubeChannelRef('https://www.youtube.com/@mrsyumtum'), true);
  assert.equal(isYouTubeChannelRef('https://www.youtube.com/channel/UC1234567890123456789012'), true);
  assert.equal(isYouTubeChannelRef('https://www.youtube.com/watch?v=abc123'), false);
});
test('experiment assignment is persisted for the same tenant and user', async () => {
  let assigned: string | null = null;
  let inserts = 0;
  const db = { prepare(sql: string) { return { bind() { return { async first() { if (sql.includes('FROM experiments')) return { id: 'experiment-1', variants_json: JSON.stringify([{ key: 'A', freeUsageLimit: 2 }, { key: 'B', freeUsageLimit: 5 }]) }; if (sql.includes('FROM experiment_assignments')) return assigned ? { variant: assigned } : null; return null; }, async run() { inserts++; assigned = 'A'; return {}; } }; } }; } } as unknown as D1Database;
  const env = { DB: db } as Env;
  const first = await getGateVariant(env, 'creator-one', 'user-one', 'AI_TEXT');
  const second = await getGateVariant(env, 'creator-one', 'user-one', 'AI_TEXT');
  assert.deepEqual(first, second);
  assert.equal(inserts, 1);
});
