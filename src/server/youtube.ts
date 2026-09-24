import type { Env } from './db';
import type { Ingredient } from '../shared/types';
import { indexContentEmbedding } from './retrieval';
import { cleanContentTitle } from './domain';

export interface TranscriptProvider { name: string; getAuthorizedTranscript(creatorId: string, videoId: string): Promise<{ text: string; rightsStatus: 'creator_authorized' | 'licensed'; sourceUrl: string } | null> }
type ChannelResponse = { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
type PlaylistResponse = { nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> };
type VideoResponse = { items?: Array<{ id: string; snippet?: { title?: string; description?: string; publishedAt?: string; tags?: string[]; thumbnails?: { medium?: { url?: string } } }; contentDetails?: { duration?: string } }> };
async function official<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.search = new URLSearchParams({ ...params, key }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`YouTube API status ${response.status}`);
  return response.json() as Promise<T>;
}
export function durationMinutes(iso: string): number {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return Math.ceil(Number(match[1] || 0) * 60 + Number(match[2] || 0) + Number(match[3] || 0) / 60);
}
function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function channelUrlFromRef(ref: string): string {
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(ref)) return `https://www.youtube.com/channel/${ref}`;
  const parsed = new URL(ref);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com' && parsed.hostname !== 'youtube.com') throw new Error('Use a YouTube channel URL');
  return parsed.toString();
}
async function resolveChannelId(channelRef: string): Promise<{ channelId: string; channelUrl: string }> {
  const channelUrl = channelUrlFromRef(channelRef);
  const direct = channelUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/);
  if (direct?.[1]) return { channelId: direct[1], channelUrl };
  const response = await fetch(channelUrl, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`YouTube channel page status ${response.status}`);
  const html = await response.text();
  const match = html.match(/(?:itemprop=["']channelId["'][^>]+content=["']|"channelId"\s*:\s*")([A-Z][a-zA-Z0-9_-]{20,})/i) || html.match(/"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/i);
  if (!match?.[1]) throw new Error('Could not resolve a YouTube channel ID from this URL');
  return { channelId: match[1], channelUrl };
}
export async function resolveYouTubeChannelId(channelRef: string): Promise<{ channelId: string; channelUrl: string }> {
  return resolveChannelId(channelRef);
}
export function isYouTubeChannelRef(ref: string): boolean {
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(ref.trim())) return true;
  try {
    const parsed = new URL(ref);
    if (parsed.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(parsed.hostname)) return false;
    return /^\/(?:@[^/]+|channel\/UC|c\/|user\/)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
export type PublicVideo = { id: string; title: string; description: string; publishedAt: string | null; thumbnailUrl: string | null };
const ingredientWords = ['pasta', 'tomato', 'tomatoes', 'onion', 'garlic', 'paneer', 'cashew', 'cashews', 'cream', 'cheese', 'potato', 'rice', 'flour', 'atta', 'suji', 'rava', 'semolina', 'ghee', 'sugar', 'dahi', 'curd', 'yogurt', 'honey', 'milk', 'baking powder', 'baking soda', 'dates', 'lentils', 'chickpeas', 'oil', 'butter', 'spices', 'salt', 'pepper', 'cocoa', 'cocoa powder', 'coffee', 'coffee powder', 'cardamom', 'elaichi', 'ealichi', 'saffron', 'kesar', 'chocolate', 'chocolates'];
const ingredientAliases: Record<string, string> = { tomatoes: 'tomato', cashews: 'cashew', 'garlic cloves': 'garlic', 'powdered sugar': 'sugar', 'desi khaand': 'sugar', khaand: 'sugar', atta: 'wheat flour', suji: 'semolina', rava: 'semolina', dahi: 'yogurt', curd: 'yogurt', elaichi: 'cardamom', ealichi: 'cardamom', kesar: 'saffron', chocolates: 'chocolate' };
const unitAliases: Record<string, string> = { cups: 'cup', teaspoons: 'tsp', teaspoon: 'tsp', tablespoons: 'tbsp', tablespoon: 'tbsp', grams: 'g', gram: 'g', gm: 'g', kilograms: 'kg', kilogram: 'kg', milliliters: 'ml', millilitres: 'ml', milliliter: 'ml', millilitre: 'ml', pieces: 'piece', pods: 'pod', cloves: 'clove', strands: 'strand' };
function ingredientHints(description: string): string[] {
  const lower = description.toLowerCase();
  return [...new Set(ingredientWords.filter((ingredient) => {
    if (!new RegExp(`\\b${ingredient}\\b`, 'i').test(lower)) return false;
    return !new RegExp(`\\b(?:without|no)\\b[^.!?\\n]{0,32}\\b${ingredient}\\b`, 'i').test(lower);
  }).map((ingredient) => ingredientAliases[ingredient] || ingredient))].slice(0, 20);
}
function canonicalIngredientName(value: string): string {
  const cleaned = value.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').replace(/\b(cloves?|pieces?|pods?|strands?)$/, '').trim();
  if (ingredientAliases[cleaned]) return ingredientAliases[cleaned];
  const alias = Object.entries(ingredientAliases).find(([key]) => cleaned.endsWith(` ${key}`));
  return alias?.[1] || cleaned;
}
function ingredientCategory(name: string): Ingredient['category'] {
  if (/tomato|onion|garlic|potato/.test(name)) return 'vegetables';
  if (/paneer|cream|cheese|yogurt|milk|ghee|butter/.test(name)) return 'dairy';
  if (/salt|pepper|spice|cardamom|saffron|cocoa|cinnamon|oregano|chilli/.test(name)) return 'spices';
  if (/chicken|soy|protein/.test(name)) return 'protein';
  return 'pantry';
}
function parseAmount(value: string): { quantity: number; unit: string } | null {
  const normalized = value.toLowerCase().replace(/(\d)(?=[a-z])/g, '$1 ').replace(/\s+/g, ' ').trim();
  const unitMatch = normalized.match(/(?:^|\s)(cups?|tsp|teaspoons?|tbsp|tablespoons?|kg|kilograms?|g|gm|grams?|ml|millilit(?:er|re)s?|pieces?|pods?|cloves?|strands?)\b/);
  const rawUnit = unitMatch?.[1];
  const unit = rawUnit ? unitAliases[rawUnit] || rawUnit : 'piece';
  const amount = normalized.slice(0, unitMatch?.index ?? normalized.length).replace(/[^0-9./&-]/g, ' ').replace(/\.$/, '').trim();
  const range = amount.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return { quantity: (Number(range[1]) + Number(range[2])) / 2, unit };
  const fraction = amount.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction && Number(fraction[2])) return { quantity: Number(fraction[1]) / Number(fraction[2]), unit };
  const numeric = amount.match(/^\d+(?:\.\d+)?$/);
  if (numeric) return { quantity: Number(numeric[0]), unit };
  return null;
}
function parseIngredientLine(line: string): Ingredient | null {
  const clean = line.replace(/^[*•\-\s]+/, '').replace(/\s+/g, ' ').trim();
  if (!clean || /^products that i use|^subscribe|^follow me|^https?:/i.test(clean)) return null;
  const pinch = clean.match(/^a pinch of\s+(.+)$/i);
  if (pinch) {
    const name = canonicalIngredientName(pinch[1] ?? '');
    return name ? { name, quantity: 1, unit: 'pinch', category: ingredientCategory(name) } : null;
  }
  const match = clean.match(/^(.+?)\s*[-–—:]\s*(.+)$/);
  if (!match) return null;
  const name = canonicalIngredientName(match[1] ?? '');
  const amount = parseAmount(match[2] ?? '');
  if (!name || !amount || amount.quantity <= 0) return null;
  return { name, quantity: amount.quantity, unit: amount.unit, category: ingredientCategory(name) };
}
function parseDescriptionIngredients(description: string): { ingredients: Ingredient[]; hints: string[] } {
  const block = description.match(/(?:^|\n)\s*ingredients\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\s*products that i use|\n\s*subscribe|$)/i)?.[1];
  if (!block) return { ingredients: [], hints: [] };
  const ingredients: Ingredient[] = [];
  const hints: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const parsed = parseIngredientLine(line);
    if (parsed && !ingredients.some((item) => item.name === parsed.name)) ingredients.push(parsed);
    else {
      const hint = canonicalIngredientName(line.replace(/\s*[–—:-].*$/, ''));
      if (hint && ingredientHints(hint).length && !hints.includes(hint)) hints.push(hint);
    }
  }
  return { ingredients: ingredients.slice(0, 60), hints };
}
function metadataFor(title: string, description: string, tags: string[], minutes: number) {
  const parsed = parseDescriptionIngredients(description);
  const structuredNames = new Set(parsed.ingredients.map((item) => item.name));
  const hints = [...new Set([...parsed.hints, ...ingredientHints(`${title} ${description} ${tags.join(' ')}`)])]
    .filter((hint) => ![...structuredNames].some((name) => name === hint || name.includes(hint) || hint.includes(name)))
    .slice(0, 20);
  return { minutes, equipment: [], diet: [], servings: 1, ingredients: parsed.ingredients, ingredientHints: hints, extractionStatus: 'metadata_only' };
}
export function parsePublicFeed(xml: string): PublicVideo[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 25).flatMap((entry) => {
    const value = entry[1] || '';
    const id = value.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = value.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (!id || !title) return [];
    return [{
      id: decodeXml(id),
      title: decodeXml(title).trim(),
      description: decodeXml(value.match(/<media:description(?:\s[^>]*)?>([\s\S]*?)<\/media:description>/)?.[1] || '').trim().slice(0, 5000),
      publishedAt: value.match(/<published>([^<]+)<\/published>/)?.[1] || null,
      thumbnailUrl: decodeXml(value.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/)?.[1] || '') || null,
    }];
  });
}
async function publicVideos(channelId: string): Promise<PublicVideo[]> {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`YouTube public feed status ${response.status}`);
  return parsePublicFeed(await response.text());
}
async function persistPublicVideos(env: Env, creatorId: string, channelId: string, channelUrl: string, videos: PublicVideo[]) {
  const sourceId = `youtube-public-${creatorId}-${channelId}`;
  await env.DB.prepare("INSERT INTO content_sources(id,creator_id,source_type,source_url,external_id,rights_status,ingestion_status) VALUES(?,?,?,?,?,'public_metadata','running') ON CONFLICT(creator_id,source_type,external_id) DO UPDATE SET ingestion_status='running',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(sourceId, creatorId, 'youtube_public', channelUrl, channelId).run();
  for (const video of videos) {
    const title = cleanContentTitle(video.title);
    const metadata = metadataFor(title, video.description, [], 0);
    const provenance = { kind: 'public_metadata', provider: 'YouTube public feed', channelId, retrievedAt: new Date().toISOString(), note: metadata.ingredients.length ? 'Public description metadata. Ingredient quantities were parsed from an explicit Ingredients section; no transcript or cooking steps.' : 'Public video metadata only. No transcript or cooking steps.' };
    await env.DB.prepare("INSERT INTO content_items(id,creator_id,source_id,external_id,source_url,title,description,published_at,thumbnail_url,content_type,structured_json,tags_json,processing_status,provenance_json,rights_status) VALUES(?,?,?,?,?,?,?,?,?, 'video',?,?,'ready',?,'public_metadata') ON CONFLICT(creator_id,source_id,external_id) DO UPDATE SET title=excluded.title,description=excluded.description,published_at=excluded.published_at,thumbnail_url=excluded.thumbnail_url,structured_json=excluded.structured_json,provenance_json=excluded.provenance_json").bind(`yt-${creatorId}-${video.id}`, creatorId, sourceId, video.id, `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`, title, video.description, video.publishedAt, video.thumbnailUrl, JSON.stringify(metadata), JSON.stringify([]), JSON.stringify(provenance)).run();
  }
  await env.DB.prepare("UPDATE content_sources SET ingestion_status='complete',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND creator_id=?").bind(sourceId, creatorId).run();
  return { sourceId, processed: videos.length, nextPageAvailable: false, status: 'complete', sourceType: 'public_metadata' };
}
export async function ingestYouTubePage(env: Env, creatorId: string, channelRef: string) {
  const resolved = await resolveChannelId(channelRef);
  const channelId = resolved.channelId;
  if (!env.YOUTUBE_API_KEY) return persistPublicVideos(env, creatorId, channelId, resolved.channelUrl, await publicVideos(channelId));
  // Keep one canonical source for this channel so a later official API import
  // upgrades the public-feed records instead of creating duplicate content IDs.
  const sourceId = `youtube-public-${creatorId}-${channelId}`;
  await env.DB.prepare("INSERT INTO content_sources(id,creator_id,source_type,source_url,external_id,rights_status,ingestion_status) VALUES(?,?,?,?,?,'public_metadata','running') ON CONFLICT(id) DO UPDATE SET source_type='youtube_public',source_url=excluded.source_url,external_id=excluded.external_id,rights_status='public_metadata',ingestion_status='running',cursor=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(sourceId, creatorId, 'youtube_public', `https://www.youtube.com/channel/${channelId}`, channelId).run();
  try {
    const source = await env.DB.prepare('SELECT cursor FROM content_sources WHERE id=? AND creator_id=?').bind(sourceId, creatorId).first<{ cursor: string | null }>();
    const channel = await official<ChannelResponse>('channels', { part: 'contentDetails', id: channelId }, env.YOUTUBE_API_KEY);
    const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error('Channel or uploads playlist not found');
    const page = await official<PlaylistResponse>('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '25', ...(source?.cursor ? { pageToken: source.cursor } : {}) }, env.YOUTUBE_API_KEY);
    const ids = (page.items || []).map((item) => item.contentDetails?.videoId).filter((videoId): videoId is string => !!videoId);
    const videos = ids.length ? await official<VideoResponse>('videos', { part: 'snippet,contentDetails', id: ids.join(',') }, env.YOUTUBE_API_KEY) : { items: [] };
    for (const video of videos.items || []) {
      if (!video.snippet?.title) continue;
      const tags = (video.snippet.tags || []).slice(0, 25);
      const description = (video.snippet.description || '').slice(0, 5000);
      const title = cleanContentTitle(video.snippet.title);
      const metadata = metadataFor(title, description, tags, durationMinutes(video.contentDetails?.duration || ''));
      const provenance = { kind: 'official_api', provider: 'YouTube Data API', channelId, retrievedAt: new Date().toISOString(), note: metadata.ingredients.length ? 'Public description metadata. Ingredient quantities were parsed from an explicit Ingredients section; no transcript or cooking steps.' : 'Public metadata only. No transcript or cooking steps.' };
      await env.DB.prepare("INSERT INTO content_items(id,creator_id,source_id,external_id,source_url,title,description,published_at,thumbnail_url,content_type,structured_json,tags_json,processing_status,provenance_json,rights_status) VALUES(?,?,?,?,?,?,?,?,?, 'video',?,?,'ready',?,'public_metadata') ON CONFLICT(creator_id,source_id,external_id) DO UPDATE SET title=excluded.title,description=excluded.description,published_at=excluded.published_at,thumbnail_url=excluded.thumbnail_url,structured_json=excluded.structured_json,tags_json=excluded.tags_json,provenance_json=excluded.provenance_json").bind(`yt-${creatorId}-${video.id}`, creatorId, sourceId, video.id, `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`, title, description, video.snippet.publishedAt || null, video.snippet.thumbnails?.medium?.url || null, JSON.stringify(metadata), JSON.stringify(tags), JSON.stringify(provenance)).run();
      try {
        await indexContentEmbedding(env, creatorId, { id: `yt-${creatorId}-${video.id}`, creatorId, title, description, sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`, thumbnailUrl: video.snippet.thumbnails?.medium?.url || null, tags, meta: metadata, provenance, rightsStatus: 'public_metadata', publishedAt: video.snippet.publishedAt || null });
      } catch (error) { console.warn(JSON.stringify({ event: 'embedding_deferred', creatorId, videoId: video.id, message: error instanceof Error ? error.message : 'unknown' })); }
    }
    await env.DB.prepare("UPDATE content_sources SET cursor=?,ingestion_status=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND creator_id=?").bind(page.nextPageToken || null, page.nextPageToken ? 'partial' : 'complete', sourceId, creatorId).run();
    return { sourceId, processed: videos.items?.length || 0, nextPageAvailable: !!page.nextPageToken, status: page.nextPageToken ? 'partial' : 'complete' };
  } catch (error) {
    // An invalid, expired, or quota-exhausted API key should not prevent the
    // safe public-metadata path from populating the creator page.
    try {
      return await persistPublicVideos(env, creatorId, channelId, resolved.channelUrl, await publicVideos(channelId));
    } catch {
      // Preserve the official API error as the observable failure reason.
    }
    await env.DB.prepare("UPDATE content_sources SET ingestion_status='failed',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND creator_id=?").bind(error instanceof Error ? error.message.slice(0, 250) : 'unknown', sourceId, creatorId).run();
    throw error;
  }
}
export async function classifyYouTubeVertical(env: Env, channelRef: string): Promise<{ vertical: 'cooking' | 'fitness' | null; title: string | null; reason: string }> {
  if (!env.YOUTUBE_API_KEY) return { vertical: null, title: null, reason: 'Official channel metadata unavailable without YouTube API credentials' };
  try {
    const { channelId } = await resolveChannelId(channelRef);
    const response = await official<{ items?: Array<{ snippet?: { title?: string; description?: string; keywords?: string } }> }>('channels', { part: 'snippet', id: channelId }, env.YOUTUBE_API_KEY);
    const snippet = response.items?.[0]?.snippet;
    if (!snippet) return { vertical: null, title: null, reason: 'Channel metadata unavailable' };
    const copy = `${snippet.title || ''} ${snippet.description || ''} ${snippet.keywords || ''}`.toLowerCase();
    const fitness = (copy.match(/\b(fitness|workout|exercise|strength|pilates|yoga|gym|training|mobility)\b/g) || []).length;
    const cooking = (copy.match(/\b(cooking|recipe|recipes|food|kitchen|baking|chef|meal)\b/g) || []).length;
    const vertical = fitness >= 2 && fitness > cooking * 2 ? 'fitness' : cooking >= 2 && cooking > fitness * 2 ? 'cooking' : null;
    return { vertical, title: snippet.title || null, reason: vertical ? 'Public channel title and description' : 'Public channel metadata is mixed or inconclusive' };
  } catch { return { vertical: null, title: null, reason: 'Channel metadata could not be verified' }; }
}
