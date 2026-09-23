import type { ContentItem, Creator, RecipeMeta } from '../shared/types';
import { cleanContentTitle } from './domain';

export type AgentQueueMessage = { taskId: string };
export type AgentWorkflowBinding = {
  create(options?: { id?: string; params?: { taskId: string } }): Promise<{ id: string }>;
};
export type Env = { DB: D1Database; ASSETS: Fetcher; VECTOR?: Vectorize; AGENT_TASK_QUEUE?: Queue<AgentQueueMessage>; AGENT_TASK_WORKFLOW?: AgentWorkflowBinding; APP_ENV: string; AI_PRIMARY: string; AI_FALLBACK: string; AI_MODEL_CHEAP: string; AI_MODEL_STANDARD: string; AI_MODEL_REASONING: string; AI_EMBEDDING_MODEL?: string; AI_PRICING_JSON?: string; OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string; SESSION_SECRET?: string; ADMIN_DEV_TOKEN?: string; CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string; YOUTUBE_API_KEY?: string; AGENT_REACH_URL?: string; AGENT_REACH_TOKEN?: string };
type CreatorRow = { id: string; slug: string; name: string; category: string; status: string; domain?: string | null; brand_json: string; agent_json: string; monetization_json: string };
type ContentRow = { id: string; creator_id: string; title: string; description: string; source_url: string; thumbnail_url: string | null; tags_json: string; structured_json: string; provenance_json: string; rights_status: string; published_at: string | null };
export const id = () => crypto.randomUUID();
export function json<T>(value: string): T { return JSON.parse(value) as T; }
export function creatorFromRow(row: CreatorRow): Creator {
  const legacyDemo = row.slug === 'anyone-can-cook-demo';
  const storedBrand = json<Creator['brand']>(row.brand_json);
  return {
    id: row.id,
    slug: row.slug,
    name: legacyDemo ? 'Creator Kitchen Demo' : row.name,
    creatorUrl: row.domain || undefined,
    category: row.category,
    status: row.status,
    brand: legacyDemo
      ? { ...storedBrand, hero: 'Your creator kitchen, ready to cook.', disclaimer: 'Illustrative demo workspace. Creator content and rights status are shown separately.' }
      : storedBrand,
    agent: json(row.agent_json),
    monetization: json(row.monetization_json),
  };
}
export function contentFromRow(row: ContentRow): ContentItem { return { id: row.id, creatorId: row.creator_id, title: cleanContentTitle(row.title), description: row.description, sourceUrl: row.source_url, thumbnailUrl: row.thumbnail_url, tags: json(row.tags_json), meta: json<RecipeMeta>(row.structured_json), provenance: json(row.provenance_json), rightsStatus: row.rights_status, publishedAt: row.published_at }; }
export async function getCreator(db: D1Database, slug: string): Promise<Creator | null> {
  const row = await db.prepare('SELECT id,slug,name,category,status,domain,brand_json,agent_json,monetization_json FROM creators WHERE slug=? AND status IN (\'demo\',\'active\')').bind(slug).first<CreatorRow>();
  return row ? creatorFromRow(row) : null;
}
export async function getContent(db: D1Database, creatorId: string, contentId: string, includeIllustrative = true): Promise<ContentItem | null> {
  const visibility = includeIllustrative ? '' : " AND COALESCE(json_extract(provenance_json,'$.kind'),'')!='illustrative'";
  const row = await db.prepare(`SELECT id,creator_id,title,description,source_url,thumbnail_url,tags_json,structured_json,provenance_json,rights_status,published_at FROM content_items WHERE creator_id=? AND id=? AND processing_status='ready' AND rights_status!='unknown_rights'${visibility}`).bind(creatorId, contentId).first<ContentRow>();
  return row ? contentFromRow(row) : null;
}
export async function listContent(db: D1Database, creatorId: string, query = '', limit = 30, includeIllustrative = true): Promise<ContentItem[]> {
  const term = `%${query.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
  const visibility = includeIllustrative ? '' : " AND COALESCE(json_extract(provenance_json,'$.kind'),'')!='illustrative'";
  const rows = await db.prepare(`SELECT id,creator_id,title,description,source_url,thumbnail_url,tags_json,structured_json,provenance_json,rights_status,published_at FROM content_items WHERE creator_id=? AND processing_status='ready' AND rights_status!='unknown_rights'${visibility} AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\' OR structured_json LIKE ? ESCAPE '\\') ORDER BY title LIMIT ?`).bind(creatorId, term, term, term, term, Math.min(limit, 50)).all<ContentRow>();
  return rows.results.map(contentFromRow);
}
export async function recordEvent(db: D1Database, creatorId: string, type: string, feature?: string, userId?: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await db.prepare('INSERT INTO events(id,creator_id,user_id,event_type,feature,metadata_json) VALUES(?,?,?,?,?,?)').bind(id(), creatorId, userId || null, type, feature || null, JSON.stringify(metadata)).run();
}
