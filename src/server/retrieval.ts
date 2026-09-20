import type { ContentItem } from '../shared/types';
import { getContent, id, listContent, type Env } from './db';

async function embed(env: Env, text: string): Promise<{ values: number[]; model: string; tokens: number }> {
  if (!env.OPENAI_API_KEY) throw new Error('Embedding key not configured');
  const model = env.AI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const response = await fetch(`${base.replace(/\/$/, '')}/embeddings`, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: text.slice(0, 6000), encoding_format: 'float' }) });
  if (!response.ok) throw new Error(`Embedding provider status ${response.status}`);
  const body = await response.json() as { data?: Array<{ embedding?: number[] }>; usage?: { total_tokens?: number } };
  const values = body.data?.[0]?.embedding;
  if (!values?.length) throw new Error('Empty embedding');
  return { values, model, tokens: body.usage?.total_tokens || 0 };
}
async function recordEmbedding(env: Env, creatorId: string, model: string, tokens: number) {
  const requestId = id();
  const price = env.AI_PRICING_JSON ? (JSON.parse(env.AI_PRICING_JSON) as Record<string, { inputPerMillion: number }>)[model] : undefined;
  const cost = price && Number.isFinite(price.inputPerMillion) ? tokens * price.inputPerMillion / 1_000_000 : null;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO ai_requests(id,creator_id,feature,task,policy,provider,model,status,estimated_cost_usd) VALUES(?,?,?,'embedding','EMBEDDING','openai',?,?,?)").bind(requestId, creatorId, 'CONTENT_RETRIEVAL', model, cost === null ? 'unpriced' : 'ok', cost),
    env.DB.prepare('INSERT INTO ai_usage(id,creator_id,request_id,input_tokens,output_tokens,estimated_cost_usd) VALUES(?,?,?,?,0,?)').bind(id(), creatorId, requestId, tokens, cost || 0)
  ]);
}
export async function indexContentEmbedding(env: Env, creatorId: string, item: ContentItem): Promise<boolean> {
  if (!env.VECTOR || !env.OPENAI_API_KEY) return false;
  const text = `${item.title}\n${item.description}\n${item.tags.join(', ')}\n${item.meta.ingredients.map((ingredient) => ingredient.name).join(', ')}\n${(item.meta.ingredientHints || []).join(', ')}`;
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map((value) => value.toString(16).padStart(2, '0')).join('');
  const model = env.AI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const old = await env.DB.prepare('SELECT checksum FROM content_embeddings WHERE creator_id=? AND content_id=? AND model=?').bind(creatorId, item.id, model).first<{ checksum: string }>();
  if (old?.checksum === checksum) return false;
  const embedded = await embed(env, text);
  await env.VECTOR.upsert([{ id: `${creatorId}:${item.id}`, namespace: creatorId, values: embedded.values, metadata: { creatorId, contentId: item.id } }]);
  await env.DB.prepare('INSERT INTO content_embeddings(id,creator_id,content_id,model,vector_id,checksum) VALUES(?,?,?,?,?,?) ON CONFLICT(creator_id,content_id,model) DO UPDATE SET vector_id=excluded.vector_id,checksum=excluded.checksum').bind(id(), creatorId, item.id, embedded.model, `${creatorId}:${item.id}`, checksum).run();
  await recordEmbedding(env, creatorId, embedded.model, embedded.tokens);
  return true;
}
export async function retrieveCreatorKnowledge(env: Env, creatorId: string, query: string): Promise<{ items: ContentItem[]; semanticIds: Set<string>; retrieval: 'structured' | 'hybrid' }> {
  const items = await listContent(env.DB, creatorId, '', 50);
  if (!query.trim() || !env.VECTOR || !env.OPENAI_API_KEY) return { items, semanticIds: new Set(), retrieval: 'structured' };
  try {
    const embedded = await embed(env, query);
    const result = await env.VECTOR.query(embedded.values, { namespace: creatorId, topK: 20, returnMetadata: 'indexed' });
    const ids = result.matches.map((match) => String(match.metadata?.contentId || '')).filter(Boolean);
    const semanticIds = new Set<string>();
    for (const contentId of ids) if (await getContent(env.DB, creatorId, contentId)) semanticIds.add(contentId);
    await recordEmbedding(env, creatorId, embedded.model, embedded.tokens);
    return { items, semanticIds, retrieval: 'hybrid' };
  } catch (error) {
    console.warn(JSON.stringify({ event: 'vector_retrieval_fallback', creatorId, message: error instanceof Error ? error.message : 'unknown' }));
    return { items, semanticIds: new Set(), retrieval: 'structured' };
  }
}
