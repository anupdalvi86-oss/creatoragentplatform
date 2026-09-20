import type { Env } from './db';

export type GateVariant = { key: string; freeUsageLimit?: number; trialUsage?: number };
export async function getGateVariant(env: Env, creatorId: string, userId: string, feature: string): Promise<GateVariant | null> {
  const experiment = await env.DB.prepare("SELECT id,variants_json FROM experiments WHERE creator_id=? AND feature=? AND status='active' ORDER BY id LIMIT 1").bind(creatorId, feature).first<{ id: string; variants_json: string }>();
  if (!experiment) return null;
  let variants: GateVariant[];
  try { variants = JSON.parse(experiment.variants_json) as GateVariant[]; } catch { return null; }
  if (!Array.isArray(variants) || variants.length < 2) return null;
  const assigned = await env.DB.prepare('SELECT variant FROM experiment_assignments WHERE creator_id=? AND experiment_id=? AND user_id=?').bind(creatorId, experiment.id, userId).first<{ variant: string }>();
  if (assigned) return variants.find((variant) => variant.key === assigned.variant) || null;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${creatorId}:${experiment.id}:${userId}`)));
  const chosen = variants[bytes[0]! % variants.length]!;
  await env.DB.prepare('INSERT OR IGNORE INTO experiment_assignments(creator_id,experiment_id,user_id,variant) VALUES(?,?,?,?)').bind(creatorId, experiment.id, userId, chosen.key).run();
  const persisted = await env.DB.prepare('SELECT variant FROM experiment_assignments WHERE creator_id=? AND experiment_id=? AND user_id=?').bind(creatorId, experiment.id, userId).first<{ variant: string }>();
  return variants.find((variant) => variant.key === persisted?.variant) || null;
}
