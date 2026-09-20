import type { CanMakeInput, ContentItem } from "../shared/types";
import { contentFromRow, getCreator, type Env, id } from "./db";
import { canMake } from "./agent";
import {
  aggregateShopping,
  normalizeIngredient,
  rankContent,
  substitutions,
} from "./domain";
import { runScout, type ResearchInput } from "./research";
import { ingestYouTubePage } from "./youtube";
import { submitTask } from "./agentTasks";

export const SPECIALIST_ROLE_KEYS = [
  "creator_scout", "youtube_ingestion", "instagram_ingestion", "transcription",
  "translation", "recipe_extraction", "content_librarian", "rights_reviewer",
  "source_verifier", "content_repurposing", "seo_metadata", "cooking_assistant",
  "ingredient_substitution", "meal_planner", "grocery_assistant",
  "pantry_assistant", "voice_assistant", "personalization", "learning_coach",
  "support_assistant", "product_strategist", "feature_designer", "ui_ux_designer",
  "frontend_developer", "backend_developer", "workflow_tester", "evaluation_agent",
  "release_agent", "orchestrator", "model_router", "cost_monitor", "data_quality_monitor",
] as const;

export type SpecialistRoleKey = (typeof SPECIALIST_ROLE_KEYS)[number];
export type SpecialistExecution = {
  result: Record<string, unknown>;
  status: "completed" | "awaiting_review";
};

type ContentRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  source_url: string;
  thumbnail_url: string | null;
  tags_json: string;
  structured_json: string;
  provenance_json: string;
  rights_status: string;
  published_at: string | null;
};

const REVIEW_ROLES = new Set<SpecialistRoleKey>([
  "instagram_ingestion", "transcription", "translation", "recipe_extraction",
  "rights_reviewer", "content_repurposing", "seo_metadata", "learning_coach",
  "feature_designer", "ui_ux_designer", "frontend_developer", "backend_developer",
  "release_agent",
]);

const valueString = (input: Record<string, unknown>, key: string): string =>
  typeof input[key] === "string" ? String(input[key]).trim() : "";
const valueNumber = (input: Record<string, unknown>, key: string, fallback: number): number =>
  typeof input[key] === "number" && Number.isFinite(input[key]) ? Number(input[key]) : fallback;
const valueStrings = (input: Record<string, unknown>, key: string): string[] =>
  Array.isArray(input[key]) ? input[key].filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean) : [];
const blocked = (reason: string, required: string[] = []): SpecialistExecution => ({
  status: "awaiting_review",
  result: { status: "blocked", reason, required },
});

async function listCreatorContent(env: Env, creatorId: string, limit = 100): Promise<ContentItem[]> {
  const rows = await env.DB.prepare(
    `SELECT id,creator_id,title,description,source_url,thumbnail_url,tags_json,structured_json,provenance_json,rights_status,published_at
     FROM content_items WHERE creator_id=? ORDER BY created_at DESC LIMIT ?`,
  ).bind(creatorId, Math.min(limit, 100)).all<ContentRow>();
  return (rows.results || []).map(contentFromRow);
}

async function getContentItem(env: Env, creatorId: string, contentId: string): Promise<ContentItem | null> {
  const row = await env.DB.prepare(
    `SELECT id,creator_id,title,description,source_url,thumbnail_url,tags_json,structured_json,provenance_json,rights_status,published_at
     FROM content_items WHERE creator_id=? AND id=?`,
  ).bind(creatorId, contentId).first<ContentRow>();
  return row ? contentFromRow(row) : null;
}

async function creatorForId(env: Env, creatorId: string) {
  const row = await env.DB.prepare("SELECT slug FROM creators WHERE id=?").bind(creatorId).first<{ slug: string }>();
  return row ? getCreator(env.DB, row.slug) : null;
}

function contentSummary(content: ContentItem) {
  return { id: content.id, title: content.title, description: content.description.slice(0, 500), sourceUrl: content.sourceUrl, rightsStatus: content.rightsStatus };
}

async function executeContentRole(env: Env, creatorId: string, roleKey: SpecialistRoleKey, input: Record<string, unknown>): Promise<SpecialistExecution> {
  if (roleKey === "creator_scout") {
    const url = valueString(input, "url");
    if (!url) return blocked("A creator URL is required for sourced research.", ["url"]);
    const creator = await creatorForId(env, creatorId);
    if (!creator) return blocked("Creator was not found.");
    const researchInput: ResearchInput = {
      creatorId,
      url,
      category: valueString(input, "category") || creator.category,
      manualFacts: Array.isArray(input.manualFacts) ? input.manualFacts as ResearchInput["manualFacts"] : [],
    };
    return { status: "awaiting_review", result: { status: "completed_review_required", ...(await runScout(env, researchInput)) } };
  }
  if (roleKey === "youtube_ingestion") {
    const channelUrl = valueString(input, "channelUrl");
    if (!channelUrl) return blocked("A YouTube channel URL is required.", ["channelUrl"]);
    return { status: "completed", result: await ingestYouTubePage(env, creatorId, channelUrl) as unknown as Record<string, unknown> };
  }
  if (roleKey === "instagram_ingestion") {
    return blocked("Instagram ingestion needs an authorized Professional account and a configured Graph API connection; unrestricted scraping is not supported.", ["authorizedInstagramAccount", "GRAPH_API credentials"]);
  }
  if (roleKey === "transcription") {
    const transcript = valueString(input, "transcript");
    if (!transcript) return blocked("Provide creator-supplied media or an authorized caption export. The Worker does not download arbitrary media.", ["transcript or authorized media reference"]);
    const segments = transcript.split(/\n+/).map((text, index) => ({ index, startSeconds: null, endSeconds: null, text: text.trim() })).filter((segment) => segment.text);
    return { status: "awaiting_review", result: { status: "draft", language: valueString(input, "language") || "und", segments, rightsEvidence: valueString(input, "rightsEvidence") || null } };
  }
  if (roleKey === "translation") {
    const targetLanguage = valueString(input, "targetLanguage");
    const segments = Array.isArray(input.segments) ? input.segments : [];
    if (!targetLanguage || !segments.length) return blocked("Translation requires timestamped source segments and a target language; no invented translation is generated.", ["segments", "targetLanguage"]);
    const translated = Array.isArray(input.translatedSegments) ? input.translatedSegments : [];
    return { status: "awaiting_review", result: { status: translated.length ? "draft" : "translation_provider_required", targetLanguage, sourceSegmentCount: segments.length, translatedSegments: translated, sourceSegments: segments } };
  }
  if (roleKey === "recipe_extraction") {
    const contentId = valueString(input, "contentId");
    if (!contentId) return blocked("A contentId is required for recipe extraction.", ["contentId"]);
    const content = await getContentItem(env, creatorId, contentId);
    if (!content) return blocked("Content does not belong to this creator or was not found.");
    return { status: "awaiting_review", result: { status: "metadata_review", source: contentSummary(content), extractedMetadata: content.meta, evidence: content.description.slice(0, 2000), note: "Only explicit source metadata is returned; video steps are not inferred." } };
  }
  if (roleKey === "rights_reviewer") {
    const content = await listCreatorContent(env, creatorId);
    const flagged = content.filter((item) => item.rightsStatus === "unknown_rights").map(contentSummary);
    return { status: "awaiting_review", result: { status: "human_decision_required", flaggedCount: flagged.length, flagged, clearCount: content.length - flagged.length } };
  }
  if (roleKey === "source_verifier") {
    const sourceIds = valueStrings(input, "sourceContentIds");
    if (!sourceIds.length) return blocked("Provide sourceContentIds to verify claims against tenant content.", ["sourceContentIds"]);
    const content = await listCreatorContent(env, creatorId);
    const allowed = new Set(content.filter((item) => item.rightsStatus !== "unknown_rights").map((item) => item.id));
    return { status: "completed", result: { verifiedSourceContentIds: sourceIds.filter((sourceId) => allowed.has(sourceId)), rejectedSourceContentIds: sourceIds.filter((sourceId) => !allowed.has(sourceId)), tenantScoped: true } };
  }
  if (roleKey === "content_repurposing") {
    const contentId = valueString(input, "contentId");
    const formats = valueStrings(input, "formats");
    const content = contentId ? await getContentItem(env, creatorId, contentId) : null;
    if (!content || !formats.length) return blocked("Repurposing requires an approved source contentId and one or more requested formats.", ["contentId", "formats"]);
    return { status: "awaiting_review", result: { status: "draft", source: contentSummary(content), formats, drafts: formats.map((format) => ({ format, title: content.title, sourceContentId: content.id, text: `Draft ${format} derived from the approved source summary: ${content.description.slice(0, 300)}` })), publication: "not_connected" } };
  }
  if (roleKey === "seo_metadata") {
    const contentId = valueString(input, "contentId");
    const content = contentId ? await getContentItem(env, creatorId, contentId) : null;
    if (!content) return blocked("SEO metadata requires a contentId belonging to this creator.", ["contentId"]);
    const words = `${content.title} ${content.description}`.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
    const tags = [...new Set([...content.tags, ...words])].slice(0, 12);
    return { status: "awaiting_review", result: { status: "draft", source: contentSummary(content), suggestions: [{ title: content.title, description: content.description.slice(0, 155), tags }] } };
  }
  return blocked(`Unsupported content role: ${roleKey}`);
}

async function executeConsumerRole(env: Env, creatorId: string, roleKey: SpecialistRoleKey, input: Record<string, unknown>): Promise<SpecialistExecution> {
  if (roleKey === "cooking_assistant") {
    const creator = await creatorForId(env, creatorId);
    const goal = valueString(input, "goal");
    if (!creator || !goal) return blocked("Cooking Assistant requires a creator and a goal.", ["goal"]);
    const canMakeInput: CanMakeInput = { goal, ingredients: valueStrings(input, "ingredients"), equipment: valueStrings(input, "equipment"), diet: valueStrings(input, "diet"), maxMinutes: typeof input.maxMinutes === "number" ? input.maxMinutes : undefined, familySize: valueNumber(input, "familySize", 2) };
    return { status: "completed", result: await canMake(env, creator, canMakeInput, false) as unknown as Record<string, unknown> };
  }
  if (roleKey === "ingredient_substitution") {
    const ingredient = valueString(input, "ingredient");
    if (!ingredient) return blocked("An ingredient is required.", ["ingredient"]);
    const suggestion = substitutions(ingredient);
    return { status: "completed", result: { ingredient: normalizeIngredient(ingredient), ...suggestion, label: "GENERAL SUGGESTION" } };
  }
  const content = await listCreatorContent(env, creatorId);
  if (roleKey === "meal_planner") {
    const days = Math.min(7, Math.max(1, Math.floor(valueNumber(input, "days", 3))));
    const ranked = rankContent(content, { goal: valueString(input, "goal"), ingredients: valueStrings(input, "ingredients"), equipment: valueStrings(input, "equipment"), diet: valueStrings(input, "diet"), maxMinutes: typeof input.maxMinutes === "number" ? input.maxMinutes : undefined, familySize: valueNumber(input, "familySize", 2) });
    return { status: "completed", result: { days, meals: ranked.slice(0, days).map((match, index) => ({ day: index + 1, content: contentSummary(match.content), why: match.why })) } };
  }
  if (roleKey === "grocery_assistant") {
    const ids = valueStrings(input, "contentIds");
    const selected = ids.length ? content.filter((item) => ids.includes(item.id)) : content.slice(0, Math.min(3, content.length));
    if (!selected.length) return blocked("Select at least one tenant content item for a shopping list.", ["contentIds"]);
    const servings = valueNumber(input, "servings", 2);
    return { status: "completed", result: { contentIds: selected.map((item) => item.id), ingredients: aggregateShopping(selected.map((item) => ({ content: item, servings }))) } };
  }
  if (roleKey === "pantry_assistant") {
    const ingredients = valueStrings(input, "ingredients");
    if (!ingredients.length) return blocked("Pantry Assistant requires available ingredients.", ["ingredients"]);
    const matches = rankContent(content, { goal: valueString(input, "goal"), ingredients, equipment: valueStrings(input, "equipment"), diet: valueStrings(input, "diet"), familySize: 2 });
    return { status: "completed", result: { matches: matches.slice(0, 5).map((match) => ({ content: contentSummary(match.content), has: match.has, missing: match.missing, why: match.why })) } };
  }
  if (roleKey === "voice_assistant") {
    const transcript = valueString(input, "transcript");
    return transcript ? { status: "completed", result: { status: "text_ready", transcript, nextRole: "cooking_assistant" } } : blocked("Voice input requires browser speech recognition or a configured authorized speech provider.", ["transcript or speech provider"]);
  }
  if (roleKey === "personalization") {
    const userId = valueString(input, "userId");
    const preferences = input.preferences && typeof input.preferences === "object" ? input.preferences : null;
    if (!userId || !preferences) return blocked("Personalization requires an adult user's userId and explicit preferences.", ["userId", "preferences"]);
    const user = await env.DB.prepare("SELECT id FROM users WHERE creator_id=? AND id=?").bind(creatorId, userId).first();
    if (!user) return blocked("User is not scoped to this creator.");
    await env.DB.prepare("INSERT INTO user_preferences(creator_id,user_id,preferences_json) VALUES(?,?,?) ON CONFLICT(creator_id,user_id) DO UPDATE SET preferences_json=excluded.preferences_json,updated_at=CURRENT_TIMESTAMP").bind(creatorId, userId, JSON.stringify(preferences)).run();
    return { status: "completed", result: { status: "saved", creatorId, userId, preferenceKeys: Object.keys(preferences) } };
  }
  if (roleKey === "learning_coach") {
    const source = valueString(input, "contentId") ? await getContentItem(env, creatorId, valueString(input, "contentId")) : content[0];
    if (!source) return blocked("Learning Coach requires approved source content.", ["contentId"]);
    return { status: "awaiting_review", result: { status: "lesson_draft", source: contentSummary(source), lesson: { objective: `Understand the key ideas in ${source.title}`, prompts: ["What would you like to try first?", "Which constraint should we adapt?"] } } };
  }
  if (roleKey === "support_assistant") {
    const question = valueString(input, "question");
    if (!question) return blocked("Support Assistant requires a question.", ["question"]);
    const escalation = /billing|payment|rights|delete|account|privacy/i.test(question);
    return { status: "completed", result: { answer: escalation ? "This needs an operator. I have classified it for human escalation." : "I can help with content search, meal planning, substitutions, and pantry matching.", category: escalation ? "human_escalation" : "product_faq", escalated: escalation } };
  }
  return blocked(`Unsupported consumer role: ${roleKey}`);
}

async function executeEngineeringRole(env: Env, creatorId: string, roleKey: SpecialistRoleKey, input: Record<string, unknown>): Promise<SpecialistExecution> {
  const goal = valueString(input, "goal") || valueString(input, "problem") || "the requested creator product improvement";
  if (roleKey === "product_strategist") {
    return { status: "awaiting_review", result: { status: "hypothesis", goal, prioritization: { userValue: "validate with creator evidence", effort: "estimate after design", confidence: 0.25 }, next: ["add sourced evidence", "define success metric", "review with owner"] } };
  }
  if (roleKey === "feature_designer") {
    return { status: "awaiting_review", result: { status: "spec_draft", goal, acceptanceCriteria: ["tenant data remains isolated", "empty and provider-unavailable states are visible", "success and failure are observable", "cost and approval boundaries are explicit"], nonGoals: ["automatic public publishing", "unverified rights claims"] } };
  }
  if (roleKey === "ui_ux_designer") {
    return { status: "awaiting_review", result: { status: "ux_audit_draft", journey: valueString(input, "journey") || "admin specialist operation", checks: ["clear next action", "loading and failure states", "mobile layout", "keyboard and screen-reader labels", "approval state visibility"] } };
  }
  if (roleKey === "frontend_developer" || roleKey === "backend_developer") {
    return { status: "awaiting_review", result: { status: "implementation_plan", role: roleKey, goal, filesToInspect: roleKey === "frontend_developer" ? ["src/client/AdminApp.tsx", "src/client/style.css"] : ["src/server/worker.ts", "src/server/agentTasks.ts", "migrations"], verification: ["npm run typecheck", "npm test", "npm run lint", "npm run build"], branchRequired: true, autoMutation: false } };
  }
  if (roleKey === "workflow_tester") {
    return { status: "completed", result: { status: "test_matrix", scenarios: ["creator isolation", "role idempotency", "provider unavailable", "approval required", "empty content", "admin access"], commands: ["npm test", "npm run typecheck", "npm run lint", "npm run build"] } };
  }
  if (roleKey === "evaluation_agent") {
    return { status: "completed", result: { status: "evaluation_plan", files: ["evals/cooking.json"], dimensions: ["source grounding", "rights filtering", "tenant isolation", "latency", "cost", "fallback behavior"], goal } };
  }
  if (roleKey === "release_agent") {
    return { status: "awaiting_review", result: { status: "release_checklist", checks: ["quality gate", "migration order", "remote migration state", "Access protection", "public HTTP smoke", "rollback/version recorded"], deployAuthority: "human approval required" } };
  }
  return blocked(`Unsupported engineering role: ${roleKey}`);
}

async function executeOperationsRole(env: Env, creatorId: string, roleKey: SpecialistRoleKey, input: Record<string, unknown>): Promise<SpecialistExecution> {
  if (roleKey === "orchestrator") {
    const targetRoleKey = valueString(input, "targetRoleKey") as SpecialistRoleKey;
    if (!SPECIALIST_ROLE_KEYS.includes(targetRoleKey)) return blocked("Orchestrator requires an allowlisted targetRoleKey.", ["targetRoleKey"]);
    const child = await submitTask(env, { creatorId, roleKey: targetRoleKey, initiatorType: "system", initiatorId: valueString(input, "initiatorId") || "orchestrator", input: input.childInput && typeof input.childInput === "object" ? input.childInput as Record<string, unknown> : {}, idempotencyKey: `${valueString(input, "idempotencyKey") || id()}::${targetRoleKey}` });
    return { status: "completed", result: { status: "delegated", targetRoleKey, childTaskId: child.task.id, childStatus: child.task.status } };
  }
  if (roleKey === "model_router") {
    const policy = valueString(input, "policy") || "STANDARD";
    return { status: "completed", result: { policy, primary: env.AI_PRIMARY, fallback: env.AI_FALLBACK, model: policy === "CHEAP" ? env.AI_MODEL_CHEAP : policy === "REASONING" ? env.AI_MODEL_REASONING : env.AI_MODEL_STANDARD, costCeilingUsd: valueNumber(input, "maxCostUsd", 0.05) } };
  }
  if (roleKey === "cost_monitor") {
    const ai = await env.DB.prepare("SELECT COUNT(*) requests,COALESCE(SUM(estimated_cost_usd),0) estimatedCost,COALESCE(SUM(CASE WHEN status='unpriced' THEN 1 ELSE 0 END),0) unpriced FROM ai_requests WHERE creator_id=?").bind(creatorId).first<{ requests: number; estimatedCost: number; unpriced: number }>();
    const runs = await env.DB.prepare("SELECT COUNT(*) runs,COALESCE(SUM(estimated_cost_usd),0) taskCost FROM agent_task_runs r JOIN agent_tasks t ON t.id=r.task_id WHERE t.creator_id=?").bind(creatorId).first<{ runs: number; taskCost: number }>();
    return { status: "completed", result: { aiRequests: ai?.requests || 0, aiEstimatedCostUsd: ai?.estimatedCost || 0, unpricedAiRequests: ai?.unpriced || 0, taskRuns: runs?.runs || 0, taskEstimatedCostUsd: runs?.taskCost || 0, warning: (ai?.unpriced || 0) > 0 ? "Some AI requests have no verified pricing." : null } };
  }
  return blocked(`Unsupported operations role: ${roleKey}`);
}

export async function runSpecialistTask(env: Env, creatorId: string, roleKey: string, input: Record<string, unknown>): Promise<SpecialistExecution> {
  if (!SPECIALIST_ROLE_KEYS.includes(roleKey as SpecialistRoleKey)) return blocked(`Role is not implemented: ${roleKey}`);
  const key = roleKey as SpecialistRoleKey;
  if (["creator_scout", "youtube_ingestion", "instagram_ingestion", "transcription", "translation", "recipe_extraction", "rights_reviewer", "source_verifier", "content_repurposing", "seo_metadata"].includes(key)) return executeContentRole(env, creatorId, key, input);
  if (["cooking_assistant", "ingredient_substitution", "meal_planner", "grocery_assistant", "pantry_assistant", "voice_assistant", "personalization", "learning_coach", "support_assistant"].includes(key)) return executeConsumerRole(env, creatorId, key, input);
  if (["product_strategist", "feature_designer", "ui_ux_designer", "frontend_developer", "backend_developer", "workflow_tester", "evaluation_agent", "release_agent"].includes(key)) return executeEngineeringRole(env, creatorId, key, input);
  return executeOperationsRole(env, creatorId, key, input);
}

export function roleRequiresReview(roleKey: string): boolean {
  return REVIEW_ROLES.has(roleKey as SpecialistRoleKey);
}
