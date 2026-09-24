import { z } from "zod";
import type { CanMakeInput, ContentItem } from "../shared/types";
import { canMake } from "./agent";
import { checkOrigin, getSession, getAdminRole } from "./auth";
import {
  contentFromRow,
  creatorFromRow,
  getContent,
  getCreator,
  id,
  json,
  listContent,
  recordEvent,
  type AgentQueueMessage,
  type Env,
} from "./db";
import {
  aggregateShopping,
  calculateNet,
  evaluateGate,
  parseIngredients,
  rankContent,
  substitutions,
  validateRedirect,
} from "./domain";
import { factSchema, runScout } from "./research";
import { ingestYouTubePage, isYouTubeChannelRef } from "./youtube";
import { InternalEntitlementProvider } from "./entitlements";
import { getGateVariant } from "./experiments";
import {
  submitTask,
  getTask,
  listTasks,
  updateTaskStatus,
  listRoles,
  runDataQualityCheck,
  startTaskRun,
  completeTaskRun,
  failTaskRun,
  listDataQualityFindings,
  listTaskHandoffs,
  type TaskSubmission,
} from "./agentTasks";
import { dispatchTask, runTaskById, advanceTaskHandoff } from "./agentTaskRunner";
import { SPECIALIST_ROLE_KEYS } from "./specialistAgents";
import { creatorOnboardingJobs } from "./creatorOnboarding";
import { pageViewMetadata } from "./analytics";
export { AgentTaskWorkflow } from "./agentWorkflow";

const reply = (data: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
const fail = (message: string, status = 400) =>
  reply({ error: message }, status);
const contentSchema = z.object({
  goal: z.string().max(300).default(""),
  ingredients: z
    .union([z.array(z.string().max(80)).max(30), z.string().max(1000)])
    .default([]),
  equipment: z.array(z.string().max(40)).max(10).default([]),
  diet: z.array(z.string().max(40)).max(10).default([]),
  maxMinutes: z.number().int().min(1).max(240).optional(),
  familySize: z.number().int().min(1).max(20).default(2),
});
const planSchema = z.object({
  days: z.number().int().min(1).max(7),
  contentId: z.string().optional(),
  mealType: z.enum(["dinner", "lunch"]).default("dinner"),
  familySize: z.number().int().min(1).max(20),
  diet: z.array(z.string()).max(10).default([]),
  equipment: z.array(z.string()).max(10).default([]),
  excludedIngredients: z.array(z.string()).max(20).default([]),
  maxMinutes: z.number().int().min(1).max(240).optional(),
});
const agentToolSchema = z.enum([
  "searchCreatorKnowledge",
  "findSubstitution",
  "calculateServings",
  "createMealPlan",
  "createShoppingList",
]);
const recipeMetaSchema = z.object({
  minutes: z.number().int().min(1).max(240),
  prepMinutes: z.number().int().min(1).max(240).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  nutrition: z.object({
    calories: z.number().min(0).max(5000),
    protein: z.number().min(0).max(500),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(500),
  }).optional(),
  nutritionSource: z.string().max(160).optional(),
  equipment: z.array(z.string().min(1).max(40)).max(10),
  diet: z.array(z.string().min(1).max(40)).max(10),
  servings: z.number().int().min(1).max(50),
  mealType: z.enum(["main", "side", "lunch"]).optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        quantity: z.number().positive().max(100_000),
        unit: z.string().min(1).max(20),
        category: z.enum([
          "vegetables",
          "dairy",
          "pantry",
          "protein",
          "spices",
          "other",
        ]),
      }),
    )
    .min(1)
    .max(60),
});
const belongsInPlan = (item: ContentItem, mealType: "dinner" | "lunch") => {
  const searchableText = item.title + " " + item.description + " " + item.tags.join(" ");
  const dessertOrSnack = /\b(cake|cakes|pastry|pastries|dessert|desserts|sweet|sweets|cookie|cookies|brownie|brownies|muffin|muffins|cupcake|cupcakes|donut|donuts|ice cream|kheer|halwa|ladoo|laddu|barfi|modak|pudding|chocolate|snack|energy bars?)\b/i;
  if (dessertOrSnack.test(searchableText)) return false;
  return mealType === "lunch"
    ? item.meta.mealType === "lunch"
    : !["side", "lunch"].includes(item.meta.mealType || "main");
};
async function body(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > 16_384)
    throw new Error("Request too large");
  return request.json();
}
async function useFeature(
  env: Env,
  creatorId: string,
  userId: string,
  feature: string,
  consume = true,
) {
  const row = await env.DB.prepare(
    "SELECT required_entitlement,free_usage_limit,trial_usage,reset_period,enabled FROM feature_gates WHERE creator_id=? AND feature=?",
  )
    .bind(creatorId, feature)
    .first<{
      required_entitlement: string | null;
      free_usage_limit: number | null;
      trial_usage: number;
      reset_period: string;
      enabled: number;
    }>();
  if (!row) return { allowed: true, feature };
  const variant = await getGateVariant(env, creatorId, userId, feature);
  if (variant?.freeUsageLimit !== undefined)
    row.free_usage_limit = variant.freeUsageLimit;
  if (variant?.trialUsage !== undefined) row.trial_usage = variant.trialUsage;
  const entitlements = await new InternalEntitlementProvider(env).listActive(
    creatorId,
    userId,
  );
  const period =
    row.reset_period === "day"
      ? new Date().toISOString().slice(0, 10)
      : "lifetime";
  const usage = await env.DB.prepare(
    "SELECT used FROM usage_limits WHERE creator_id=? AND user_id=? AND feature=? AND period_key=?",
  )
    .bind(creatorId, userId, feature, period)
    .first<{ used: number }>();
  const gate = evaluateGate(
    feature,
    {
      requiredEntitlement: row.required_entitlement,
      freeUsageLimit: row.free_usage_limit,
      trialUsage: row.trial_usage,
      enabled: row.enabled,
    },
    usage?.used || 0,
    entitlements,
  );
  if (
    gate.allowed &&
    consume &&
    row.required_entitlement &&
    !entitlements.includes(row.required_entitlement)
  ) {
    const limit = row.free_usage_limit ?? row.trial_usage;
    const updated = await env.DB.prepare(
      "INSERT INTO usage_limits(creator_id,user_id,feature,period_key,used) VALUES(?,?,?,?,1) ON CONFLICT(creator_id,user_id,feature,period_key) DO UPDATE SET used=used+1 WHERE used<? RETURNING used",
    )
      .bind(creatorId, userId, feature, period, limit)
      .first<{ used: number }>();
    if (!updated)
      return {
        allowed: false,
        feature,
        requiredEntitlement: row.required_entitlement,
        paywallContext: "Free allowance reached.",
      };
  }
  return gate;
}
async function withinRateLimit(
  env: Env,
  creatorId: string,
  userId: string,
): Promise<boolean> {
  const period = new Date().toISOString().slice(0, 16);
  const row = await env.DB.prepare(
    "INSERT INTO usage_limits(creator_id,user_id,feature,period_key,used) VALUES(?,?,?,?,1) ON CONFLICT(creator_id,user_id,feature,period_key) DO UPDATE SET used=used+1 WHERE used<20 RETURNING used",
  )
    .bind(creatorId, userId, "RATE_REQUEST", period)
    .first();
  return !!row;
}
// Premium functionality is temporarily enabled for the current product phase.
const PREMIUM_FEATURES_ENABLED = true;

async function tenantRoute(
  request: Request,
  env: Env,
  slug: string,
  path: string[],
): Promise<Response> {
  const creator = await getCreator(env.DB, slug);
  if (!creator) return fail("Creator not found", 404);
  if (request.method === "GET" && path[0] === "config") return reply(creator);
  if (request.method === "GET" && path[0] === "content" && path[1]) {
    const item = await getContent(env.DB, creator.id, path[1], env.APP_ENV !== "production");
    return item ? reply(item) : fail("Content not found", 404);
  }
  if (request.method === "GET" && path[0] === "content") {
    const q = new URL(request.url).searchParams.get("q") || "";
    const items = await listContent(env.DB, creator.id, q, 30, env.APP_ENV !== "production");
    return reply({ items });
  }
  if (request.method === "GET" && path[0] === "saved") {
    const session = await getSession(request, env, creator.id, slug);
    const rows = await env.DB.prepare(
      "SELECT c.id,c.creator_id,c.title,c.description,c.source_url,c.thumbnail_url,c.tags_json,c.structured_json,c.provenance_json,c.rights_status,c.published_at FROM saved_content s JOIN content_items c ON c.id=s.content_id AND c.creator_id=s.creator_id WHERE s.creator_id=? AND s.user_id=? AND c.processing_status='ready' AND c.rights_status!='unknown_rights' AND (? OR COALESCE(json_extract(c.provenance_json,'$.kind'),'')!='illustrative') ORDER BY s.saved_at DESC LIMIT 100",
    )
      .bind(creator.id, session.userId, env.APP_ENV !== "production" ? 1 : 0)
      .all<Record<string, unknown>>();
    const gate = await env.DB.prepare(
      "SELECT required_entitlement,free_usage_limit,enabled FROM feature_gates WHERE creator_id=? AND feature=?",
    )
      .bind(creator.id, "SAVE_CONTENT")
      .first<{
        required_entitlement: string | null;
        free_usage_limit: number | null;
        enabled: number;
      }>();
    const entitlements = await new InternalEntitlementProvider(env).listActive(
      creator.id,
      session.userId,
    );
    const requirement =
      gate?.required_entitlement === undefined
        ? "premium"
        : gate.required_entitlement;
    const premium = !requirement || entitlements.includes(requirement);
    return reply(
      {
        items: rows.results.map((row) => contentFromRow(row as never)),
        limit: PREMIUM_FEATURES_ENABLED ? null : premium ? null : (gate?.free_usage_limit ?? 5),
        premium: PREMIUM_FEATURES_ENABLED || premium,
      },
      200,
      session.cookie,
    );
  }
  if (request.method === "POST" && path[0] === "saved") {
    const input = z
      .object({ contentId: z.string().min(1).max(100) })
      .parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    if (!(await getContent(env.DB, creator.id, input.contentId, env.APP_ENV !== "production")))
      return fail("Content not found", 404);
    const gate = await env.DB.prepare(
      "SELECT required_entitlement,free_usage_limit,enabled FROM feature_gates WHERE creator_id=? AND feature=?",
    )
      .bind(creator.id, "SAVE_CONTENT")
      .first<{
        required_entitlement: string | null;
        free_usage_limit: number | null;
        enabled: number;
      }>();
    if (gate && !gate.enabled && !PREMIUM_FEATURES_ENABLED)
      return fail("Saving content is unavailable", 403);
    const entitlements = await new InternalEntitlementProvider(env).listActive(
      creator.id,
      session.userId,
    );
    const requirement =
      gate?.required_entitlement === undefined
        ? "premium"
        : gate.required_entitlement;
    const premium = !requirement || entitlements.includes(requirement);
    const limit = PREMIUM_FEATURES_ENABLED ? null : premium ? null : (gate?.free_usage_limit ?? 5);
    const inserted = await env.DB.prepare(
      "INSERT INTO saved_content(creator_id,user_id,content_id) SELECT ?,?,? WHERE ? IS NULL OR (SELECT COUNT(*) FROM saved_content s JOIN content_items c ON c.id=s.content_id AND c.creator_id=s.creator_id WHERE s.creator_id=? AND s.user_id=? AND c.processing_status='ready' AND c.rights_status!='unknown_rights')<? ON CONFLICT(creator_id,user_id,content_id) DO NOTHING",
    )
      .bind(
        creator.id,
        session.userId,
        input.contentId,
        limit,
        creator.id,
        session.userId,
        limit,
      )
      .run();
    if (
      !inserted.meta.changes &&
      !(await env.DB.prepare(
        "SELECT 1 FROM saved_content WHERE creator_id=? AND user_id=? AND content_id=?",
      )
        .bind(creator.id, session.userId, input.contentId)
        .first())
    ) {
      await recordEvent(
        env.DB,
        creator.id,
        "paywall_view",
        "SAVE_CONTENT",
        session.userId,
      );
      return reply(
        {
          type: "FEATURE_GATE",
          feature: "SAVE_CONTENT",
          requiredEntitlement: gate?.required_entitlement || "premium",
          paywallContext: `Your ${limit} saved ideas are full. Unlock more saved ideas with the available plan.`,
        },
        200,
        session.cookie,
      );
    }
    if (inserted.meta.changes)
      await recordEvent(
        env.DB,
        creator.id,
        "content_saved",
        "SAVE_CONTENT",
        session.userId,
        { contentId: input.contentId },
      );
    return reply(
      { saved: true, contentId: input.contentId },
      200,
      session.cookie,
    );
  }
  if (request.method === "DELETE" && path[0] === "saved" && path[1]) {
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    const deleted = await env.DB.prepare(
      "DELETE FROM saved_content WHERE creator_id=? AND user_id=? AND content_id=?",
    )
      .bind(creator.id, session.userId, path[1])
      .run();
    if (deleted.meta.changes)
      await recordEvent(
        env.DB,
        creator.id,
        "content_unsaved",
        "SAVE_CONTENT",
        session.userId,
        { contentId: path[1] },
      );
    return reply({ saved: false, contentId: path[1] }, 200, session.cookie);
  }
  if (request.method === "GET" && path[0] === "substitutions") {
    const item = new URL(request.url).searchParams.get("ingredient") || "";
    return reply(substitutions(item));
  }
  if (request.method === "POST" && path[0] === "event") {
    const input = z
      .object({
        type: z.enum([
          "page_view",
          "search",
          "content_open",
          "youtube_click",
          "paywall_dismiss",
        ]),
        contentId: z.string().max(100).optional(),
        resultCount: z.number().int().min(0).max(1000).optional(),
        pagePath: z.string().max(200).optional(),
        screen: z.enum(["home", "can-make", "plan", "grocery", "nutrition", "source", "preferences", "saved"]).optional(),
        referrerHost: z.string().max(253).optional(),
        viewport: z.enum(["mobile", "tablet", "desktop"]).optional(),
        language: z.string().max(20).optional(),
        campaign: z.object({
          source: z.string().max(100).optional(),
          medium: z.string().max(100).optional(),
          name: z.string().max(100).optional(),
          term: z.string().max(100).optional(),
          content: z.string().max(100).optional(),
        }).optional(),
      })
      .parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    if (
      input.contentId &&
      !(await getContent(env.DB, creator.id, input.contentId, env.APP_ENV !== "production"))
    )
      return fail("Content not found", 404);
    const metadata = input.type === "page_view"
      ? pageViewMetadata(request.headers, {
          pagePath: (input.pagePath || `/creator/${slug}`).replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 200) || `/creator/${slug}`,
          screen: input.screen || "home",
          ...(input.referrerHost ? { referrerHost: input.referrerHost.toLowerCase() } : {}),
          ...(input.viewport ? { viewport: input.viewport } : {}),
          ...(input.language ? { language: input.language } : {}),
          ...(input.campaign ? { campaign: input.campaign } : {}),
        })
      : {
          ...(input.contentId ? { contentId: input.contentId } : {}),
          ...(input.resultCount !== undefined ? { resultCount: input.resultCount } : {}),
        };
    await recordEvent(
      env.DB,
      creator.id,
      input.type,
      undefined,
      session.userId,
      metadata,
    );
    return reply({ ok: true }, 200, session.cookie);
  }
  if (
    request.method === "POST" &&
    path[0] === "sponsor" &&
    path[1] &&
    path[2] === "event"
  ) {
    const input = z
      .object({
        type: z.enum(["impression", "click", "interaction"]),
        placement: z.string().min(1).max(80),
      })
      .parse(await body(request));
    const campaign = await env.DB.prepare(
      "SELECT placements_json FROM campaigns WHERE creator_id=? AND id=? AND status='active' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP)",
    )
      .bind(creator.id, path[1])
      .first<{ placements_json: string }>();
    if (
      !campaign ||
      !json<string[]>(campaign.placements_json).includes(input.placement)
    )
      return fail("Campaign not found", 404);
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    await env.DB.prepare(
      "INSERT INTO campaign_events(id,creator_id,campaign_id,event_type) VALUES(?,?,?,?)",
    )
      .bind(id(), creator.id, path[1], input.type)
      .run();
    await recordEvent(
      env.DB,
      creator.id,
      `sponsor_${input.type}`,
      undefined,
      session.userId,
      { campaignId: path[1], placement: input.placement },
    );
    return reply({ ok: true }, 200, session.cookie);
  }
  if (request.method === "POST" && path[0] === "can-make") {
    const parsed = contentSchema.parse(await body(request));
    const input: CanMakeInput = {
      ...parsed,
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients
        : parseIngredients(parsed.ingredients),
    };
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply(
        { error: "Too many requests. Try again shortly." },
        429,
        session.cookie,
      );
    const gate = await useFeature(env, creator.id, session.userId, "AI_TEXT");
    const answer = await canMake(
      env,
      creator,
      input,
      gate.allowed || PREMIUM_FEATURES_ENABLED,
    );
    await recordEvent(
      env.DB,
      creator.id,
      "agent_request",
      "AI_TEXT",
      session.userId,
      { grounded: answer.sourceContentIds.length > 0 },
    );
    return reply(
      {
        ...answer,
        gate: PREMIUM_FEATURES_ENABLED || gate.allowed ? undefined : gate,
      },
      200,
      session.cookie,
    );
  }
  if (request.method === "POST" && path[0] === "plan") {
    if (!creator.agent.enabledTools.includes("createMealPlan"))
      return fail("Meal planning is unavailable for this creator", 403);
    const input = planSchema.parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply(
        { error: "Too many requests. Try again shortly." },
        429,
        session.cookie,
      );
    const entitlements = await new InternalEntitlementProvider(env).listActive(
      creator.id,
      session.userId,
    );
    const planGate = await env.DB.prepare(
      "SELECT required_entitlement,free_usage_limit,enabled FROM feature_gates WHERE creator_id=? AND feature=?",
    )
      .bind(creator.id, "MEAL_PLAN")
      .first<{
        required_entitlement: string | null;
        free_usage_limit: number | null;
        enabled: number;
      }>();
    const requirement =
      planGate?.required_entitlement === undefined
        ? "premium"
        : planGate.required_entitlement;
    const entitlement = !requirement || entitlements.includes(requirement);
    if (planGate && !planGate.enabled && !PREMIUM_FEATURES_ENABLED)
      return fail("Meal planning is unavailable", 403);
    const planVariant = await getGateVariant(
      env,
      creator.id,
      session.userId,
      "MEAL_PLAN",
    );
    const days = PREMIUM_FEATURES_ENABLED
      ? input.days
      : entitlement
      ? input.days
      : Math.min(
          input.days,
          planVariant?.freeUsageLimit ?? planGate?.free_usage_limit ?? 2,
        );
    if (days < 1)
      return reply(
        {
          type: "FEATURE_GATE",
          feature: "MEAL_PLAN",
          requiredEntitlement: planGate?.required_entitlement || "premium",
          paywallContext: "Unlock meal planning with Premium.",
        },
        200,
        session.cookie,
      );
    const content = (await listContent(env.DB, creator.id, "", 50, env.APP_ENV !== "production")).filter(
      (item) =>
        item.meta.ingredients.length > 0 &&
        belongsInPlan(item, input.mealType) &&
        !input.excludedIngredients.some((name) =>
          item.meta.ingredients.some(
            (ingredient) =>
              ingredient.name.toLowerCase() === name.toLowerCase(),
          ),
        ),
    );
    const planContent = input.contentId
      ? content.filter((item) => item.id === input.contentId)
      : content;
    if (input.contentId && !planContent.length)
      return fail("That source is not a recipe with verified ingredients", 422);
    const ranked = rankContent(planContent, {
      goal: "",
      ingredients: [],
      equipment: input.equipment,
      diet: input.diet,
      maxMinutes: input.maxMinutes,
      familySize: input.familySize,
    });
    if (!ranked.length)
      return fail("No matching source content for this plan", 422);
    const planId = id();
    const items = Array.from({ length: days }, (_, index) => ({
      id: id(),
      day: index + 1,
      content: ranked[index % ranked.length]!.content,
      servings: input.familySize,
    }));
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO meal_plans(id,creator_id,user_id,days,family_size,preferences_json) VALUES(?,?,?,?,?,?)",
      ).bind(
        planId,
        creator.id,
        session.userId,
        days,
        input.familySize,
        JSON.stringify(input),
      ),
      ...items.map((item) =>
        env.DB.prepare(
          "INSERT INTO meal_plan_items(id,creator_id,meal_plan_id,day_number,meal_type,content_id,servings) VALUES(?,?,?,?,?,?,?)",
        ).bind(
          item.id,
          creator.id,
          planId,
          item.day,
          input.mealType,
          item.content.id,
          item.servings,
        ),
      ),
    ]);
    await recordEvent(
      env.DB,
      creator.id,
      "meal_plan_created",
      "MEAL_PLAN",
      session.userId,
      { days, mealType: input.mealType },
    );
    return reply(
      {
        id: planId,
        mealType: input.mealType,
        items,
        requestedDays: input.days,
        previewDays: days,
        gate:
          PREMIUM_FEATURES_ENABLED
            ? undefined
            : input.days > days
            ? {
                type: "FEATURE_GATE",
                feature: "MEAL_PLAN",
                requiredEntitlement:
                  planGate?.required_entitlement || "premium",
                paywallContext: "Preview the rest of your week with Premium.",
              }
            : undefined,
      },
      200,
      session.cookie,
    );
  }
  if (path[0] === "plan" && path[1] && request.method === "GET") {
    const session = await getSession(request, env, creator.id, slug);
    const plan = await env.DB.prepare(
      "SELECT id,days,family_size,preferences_json FROM meal_plans WHERE id=? AND creator_id=? AND user_id=?",
    )
      .bind(path[1], creator.id, session.userId)
      .first<{
        id: string;
        days: number;
        family_size: number;
        preferences_json: string;
      }>();
    if (!plan) return fail("Plan not found", 404);
    const rows = await env.DB.prepare(
      "SELECT m.day_number,m.servings,c.id,c.creator_id,c.title,c.description,c.source_url,c.thumbnail_url,c.tags_json,c.structured_json,c.provenance_json,c.rights_status,c.published_at FROM meal_plan_items m JOIN content_items c ON c.id=m.content_id AND c.creator_id=m.creator_id AND c.processing_status='ready' AND c.rights_status!='unknown_rights' AND (? OR COALESCE(json_extract(c.provenance_json,'$.kind'),'')!='illustrative') WHERE m.creator_id=? AND m.meal_plan_id=? ORDER BY m.day_number",
    )
      .bind(env.APP_ENV !== "production" ? 1 : 0, creator.id, plan.id)
      .all<Record<string, unknown>>();
    return reply(
      {
        id: plan.id,
        previewDays: plan.days,
        requestedDays: json<{ days: number }>(plan.preferences_json).days,
        mealType:
          json<{ mealType?: "dinner" | "lunch" }>(plan.preferences_json)
            .mealType || "dinner",
        items: rows.results.map((row) => ({
          day: row.day_number,
          servings: row.servings,
          content: contentFromRow(row as never),
        })),
      },
      200,
      session.cookie,
    );
  }
  if (
    path[0] === "plan" &&
    path[1] &&
    path[2] === "replace" &&
    request.method === "POST"
  ) {
    if (!creator.agent.enabledTools.includes("createMealPlan"))
      return fail("Meal planning is unavailable for this creator", 403);
    const input = z
      .object({ day: z.number().int().min(1).max(7) })
      .parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    const plan = await env.DB.prepare(
      "SELECT id,preferences_json FROM meal_plans WHERE id=? AND creator_id=? AND user_id=?",
    )
      .bind(path[1], creator.id, session.userId)
      .first<{ id: string; preferences_json: string }>();
    if (!plan) return fail("Plan not found", 404);
    const current = await env.DB.prepare(
      "SELECT content_id FROM meal_plan_items WHERE creator_id=? AND meal_plan_id=? AND day_number=?",
    )
      .bind(creator.id, plan.id, input.day)
      .first<{ content_id: string }>();
    if (!current) return fail("Day not found", 404);
    const preferences = json<{
      diet: string[];
      equipment: string[];
      excludedIngredients: string[];
      maxMinutes?: number;
      familySize: number;
      mealType?: "dinner" | "lunch";
    }>(plan.preferences_json);
    const available = (await listContent(env.DB, creator.id, "", 50, env.APP_ENV !== "production")).filter(
      (item) =>
        item.id !== current.content_id &&
        item.meta.ingredients.length > 0 &&
        belongsInPlan(item, preferences.mealType || "dinner") &&
        !preferences.excludedIngredients.some((name) =>
          item.meta.ingredients.some(
            (ingredient) =>
              ingredient.name.toLowerCase() === name.toLowerCase(),
          ),
        ),
    );
    const next = rankContent(available, {
      goal: "",
      ingredients: [],
      equipment: preferences.equipment || [],
      diet: preferences.diet,
      maxMinutes: preferences.maxMinutes,
      familySize: preferences.familySize,
    })[0]?.content;
    if (!next) return fail("No alternative source found", 422);
    await env.DB.prepare(
      "UPDATE meal_plan_items SET content_id=? WHERE creator_id=? AND meal_plan_id=? AND day_number=?",
    )
      .bind(next.id, creator.id, plan.id, input.day)
      .run();
    return reply(
      { day: input.day, servings: preferences.familySize, content: next },
      200,
      session.cookie,
    );
  }
  if (request.method === "POST" && path[0] === "shopping-list") {
    if (!creator.agent.enabledTools.includes("createShoppingList"))
      return fail("Shopping lists are unavailable for this creator", 403);
    const input = z
      .object({ planId: z.string().uuid() })
      .parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    const plan = await env.DB.prepare(
      "SELECT id FROM meal_plans WHERE id=? AND creator_id=? AND user_id=?",
    )
      .bind(input.planId, creator.id, session.userId)
      .first();
    if (!plan) return fail("Plan not found", 404);
    const rows = await env.DB.prepare(
      "SELECT c.id,c.creator_id,c.title,c.description,c.source_url,c.thumbnail_url,c.tags_json,c.structured_json,c.provenance_json,c.rights_status,c.published_at,m.servings FROM meal_plan_items m JOIN content_items c ON c.id=m.content_id AND c.creator_id=m.creator_id AND c.processing_status='ready' AND c.rights_status!='unknown_rights' AND (? OR COALESCE(json_extract(c.provenance_json,'$.kind'),'')!='illustrative') WHERE m.creator_id=? AND m.meal_plan_id=? ORDER BY m.day_number",
    )
      .bind(env.APP_ENV !== "production" ? 1 : 0, creator.id, input.planId)
      .all<Record<string, unknown>>();
    const recipes = rows.results.map((row) => ({
      content: contentFromRow(row as never),
      servings: Number(row.servings),
    }));
    const items = aggregateShopping(recipes);
    const gate = await useFeature(
      env,
      creator.id,
      session.userId,
      "SHOPPING_LIST",
      false,
    );
    if (!gate.allowed && !PREMIUM_FEATURES_ENABLED) {
      await recordEvent(
        env.DB,
        creator.id,
        "paywall_view",
        "SHOPPING_LIST",
        session.userId,
      );
      return reply(
        {
          type: "FEATURE_GATE",
          ...gate,
          previewData: { count: items.length, items: items.slice(0, 3) },
        },
        200,
        session.cookie,
      );
    }
    const listId = id();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO shopping_lists(id,creator_id,user_id,meal_plan_id) VALUES(?,?,?,?)",
      ).bind(listId, creator.id, session.userId, input.planId),
      ...items.map((item) =>
        env.DB.prepare(
          "INSERT INTO shopping_list_items(id,creator_id,shopping_list_id,ingredient,quantity,unit,category) VALUES(?,?,?,?,?,?,?)",
        ).bind(
          id(),
          creator.id,
          listId,
          item.name,
          item.quantity,
          item.unit,
          item.category,
        ),
      ),
    ]);
    await recordEvent(
      env.DB,
      creator.id,
      "shopping_list_created",
      "SHOPPING_LIST",
      session.userId,
    );
    return reply({ id: listId, items }, 200, session.cookie);
  }
  if (path[0] === "shopping-list" && path[1] && request.method === "GET") {
    const session = await getSession(request, env, creator.id, slug);
    const list = await env.DB.prepare(
      "SELECT id FROM shopping_lists WHERE id=? AND creator_id=? AND user_id=?",
    )
      .bind(path[1], creator.id, session.userId)
      .first();
    if (!list) return fail("List not found", 404);
    const rows = await env.DB.prepare(
      "SELECT id,ingredient,quantity,unit,category,checked FROM shopping_list_items WHERE creator_id=? AND shopping_list_id=? ORDER BY category,ingredient",
    )
      .bind(creator.id, path[1])
      .all();
    return reply({ id: path[1], items: rows.results }, 200, session.cookie);
  }
  if (
    path[0] === "shopping-list" &&
    path[1] &&
    path[2] &&
    request.method === "PATCH"
  ) {
    const input = z.object({ checked: z.boolean() }).parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    const result = await env.DB.prepare(
      "UPDATE shopping_list_items SET checked=? WHERE id=? AND creator_id=? AND shopping_list_id IN (SELECT id FROM shopping_lists WHERE id=? AND creator_id=? AND user_id=?)",
    )
      .bind(
        Number(input.checked),
        path[2],
        creator.id,
        path[1],
        creator.id,
        session.userId,
      )
      .run();
    return result.meta.changes
      ? reply({ ok: true }, 200, session.cookie)
      : fail("Item not found", 404);
  }
  if (
    request.method === "POST" &&
    path[0] === "voice" &&
    path[1] === "authorize"
  ) {
    const session = await getSession(request, env, creator.id, slug);
    if (!(await withinRateLimit(env, creator.id, session.userId)))
      return reply({ error: "Too many requests." }, 429, session.cookie);
    const gate = await useFeature(env, creator.id, session.userId, "AI_VOICE");
    await recordEvent(
      env.DB,
      creator.id,
      gate.allowed ? "voice_request" : "paywall_view",
      "AI_VOICE",
      session.userId,
    );
    return reply(
      gate.allowed || PREMIUM_FEATURES_ENABLED
        ? { allowed: true, remaining: gate.remaining, mode: "browser-stt" }
        : { type: "FEATURE_GATE", ...gate },
      200,
      session.cookie,
    );
  }
  if (
    request.method === "POST" &&
    path[0] === "voice" &&
    path[1] === "complete"
  ) {
    const input = z
      .object({ durationSeconds: z.number().int().min(0).max(300) })
      .parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    await recordEvent(
      env.DB,
      creator.id,
      "voice_completed",
      "AI_VOICE",
      session.userId,
      {
        durationSeconds: input.durationSeconds,
        provider: "browser-stt",
        estimatedCostUsd: 0,
      },
    );
    return reply({ ok: true }, 200, session.cookie);
  }
  if (request.method === "DELETE" && path[0] === "preferences") {
    const session = await getSession(request, env, creator.id, slug);
    await env.DB.prepare(
      "DELETE FROM user_preferences WHERE creator_id=? AND user_id=?",
    )
      .bind(creator.id, session.userId)
      .run();
    return reply({ ok: true }, 200, session.cookie);
  }
  if (request.method === "GET" && path[0] === "preferences") {
    const session = await getSession(request, env, creator.id, slug);
    const row = await env.DB.prepare(
      "SELECT preferences_json FROM user_preferences WHERE creator_id=? AND user_id=?",
    )
      .bind(creator.id, session.userId)
      .first<{ preferences_json: string }>();
    return reply(row ? json(row.preferences_json) : {}, 200, session.cookie);
  }
  if (request.method === "PUT" && path[0] === "preferences") {
    const preferences = z
      .object({
        familySize: z.number().int().min(1).max(20).optional(),
        diet: z.array(z.string().max(40)).max(10).optional(),
        dislikedIngredients: z.array(z.string().max(80)).max(30).optional(),
        equipment: z.array(z.string().max(40)).max(10).optional(),
        spicePreference: z.enum(["mild", "medium", "hot"]).optional(),
        childAgeRanges: z.array(z.string().max(30)).max(10).optional(),
      })
      .parse(await body(request));
    const session = await getSession(request, env, creator.id, slug);
    await env.DB.prepare(
      "INSERT INTO user_preferences(creator_id,user_id,preferences_json) VALUES(?,?,?) ON CONFLICT(creator_id,user_id) DO UPDATE SET preferences_json=excluded.preferences_json,updated_at=CURRENT_TIMESTAMP",
    )
      .bind(creator.id, session.userId, JSON.stringify(preferences))
      .run();
    return reply(preferences, 200, session.cookie);
  }
  return fail("Route not found", 404);
}

async function affiliateRoute(
  env: Env,
  slug: string,
  linkSlug: string,
): Promise<Response> {
  const creator = await getCreator(env.DB, slug);
  if (!creator) return fail("Creator not found", 404);
  const link = await env.DB.prepare(
    "SELECT id,destination_url,destination_host,campaign_id,placement FROM affiliate_links WHERE creator_id=? AND slug=? AND active=1",
  )
    .bind(creator.id, linkSlug)
    .first<{
      id: string;
      destination_url: string;
      destination_host: string;
      campaign_id: string | null;
      placement: string | null;
    }>();
  if (!link) return fail("Link not found", 404);
  let url: URL;
  try {
    url = validateRedirect(link.destination_url, link.destination_host);
  } catch {
    return fail("Invalid destination", 422);
  }
  await env.DB.prepare(
    "INSERT INTO affiliate_clicks(id,creator_id,link_id,campaign_id,placement) VALUES(?,?,?,?,?)",
  )
    .bind(id(), creator.id, link.id, link.campaign_id, link.placement)
    .run();
  await recordEvent(
    env.DB,
    creator.id,
    "affiliate_click",
    undefined,
    undefined,
    { linkId: link.id },
  );
  return Response.redirect(url.toString(), 302);
}

type CreatorProvisionInput = {
  slug: string;
  name: string;
  creatorUrl?: string;
  category: "cooking";
  brand: { accent: string; hero: string; disclaimer: string };
  enabledTools: string[];
};

function sourcePlatform(sourceUrl: string): "youtube" | "instagram" | "other" {
  const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
  if (hostname === "youtube.com" || hostname === "m.youtube.com") return "youtube";
  if (hostname === "instagram.com") return "instagram";
  return "other";
}

function sourceIdentity(sourceUrl: string): { slug: string; name: string } {
  const parsed = new URL(sourceUrl);
  const candidate = parsed.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") || parsed.hostname.split(".")[0] || "creator";
  const readable = candidate.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
  const slug = readable.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "creator";
  const name = readable.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 120) || "Creator";
  return { slug: slug.length >= 3 ? slug : `${slug}-creator`, name };
}

async function uniqueCreatorSlug(env: Env, seed: string): Promise<string> {
  const base = seed.slice(0, 56);
  const rows = await env.DB.prepare("SELECT slug FROM creators WHERE slug LIKE ? ORDER BY slug").bind(`${base}%`).all<{ slug: string }>();
  const used = new Set((rows.results || []).map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 60 - String(suffix).length - 1)}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36).slice(-8)}`;
}

async function provisionCreator(env: Env, input: CreatorProvisionInput) {
  const creatorId = id();
  const agentId = id();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO creators(id,slug,name,category,status,domain,brand_json,agent_json,model_policy_json,monetization_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      creatorId,
      input.slug,
      input.name,
      input.category,
      "demo",
      input.creatorUrl || null,
      JSON.stringify(input.brand),
      JSON.stringify({
        id: agentId,
        role: input.category,
        enabledTools: input.enabledTools,
        instructions: "Ground responses in tenant content and label general suggestions.",
        promptVersion: "cooking-v1",
        modelPolicy: "STANDARD",
        maxTokens: 220,
        maxCostUsd: 0.05,
      }),
      JSON.stringify({ default: "STANDARD", maxCostUsd: 0.05 }),
      JSON.stringify({ subscriptionEnabled: false, adsEnabled: false, affiliateEnabled: false }),
    ),
    env.DB.prepare(
      "INSERT INTO agents(id,creator_id,role,instructions,prompt_version,model_policy,memory_policy,safety_policy) VALUES(?,?,?,?,?,?,?,?)",
    ).bind(
      agentId,
      creatorId,
      "cooking",
      "Ground responses in tenant content and label general suggestions.",
      "cooking-v1",
      "STANDARD",
      "adult-preferences-only",
      "no-medical-or-allergy-assurances",
    ),
    env.DB.prepare("INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)").bind(creatorId, "AI_TEXT", "premium", 5, "day", 0),
    env.DB.prepare("INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)").bind(creatorId, "AI_VOICE", "premium", null, "lifetime", 2),
    env.DB.prepare("INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)").bind(creatorId, "SHOPPING_LIST", "premium", 0, "lifetime", 0),
    env.DB.prepare("INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)").bind(creatorId, "MEAL_PLAN", "premium", 2, "lifetime", 0),
    env.DB.prepare("INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)").bind(creatorId, "SAVE_CONTENT", "premium", 5, "lifetime", 0),
    env.DB.prepare("INSERT INTO plans(id,creator_id,code,label,price_json) VALUES(?,?,?,?,?)").bind(id(), creatorId, "free", "Free", "{}"),
    env.DB.prepare("INSERT INTO plans(id,creator_id,code,label,price_json) VALUES(?,?,?,?,?)").bind(id(), creatorId, "premium", "Premium", "{}"),
    env.DB.prepare("INSERT INTO entitlements(id,creator_id,code,description) VALUES(?,?,?,?)").bind(id(), creatorId, "premium", "Premium cooking features"),
    ...input.enabledTools.map((tool) => env.DB.prepare("INSERT INTO agent_tools(creator_id,agent_id,tool_name) VALUES(?,?,?)").bind(creatorId, agentId, tool)),
  ]);
  return { id: creatorId, slug: input.slug, name: input.name };
}

async function importCreatorMetadata(env: Env, creatorId: string, creatorUrl?: string): Promise<Record<string, unknown>> {
  if (!creatorUrl) return { status: "skipped", reason: "no_creator_url" };
  if (!isYouTubeChannelRef(creatorUrl)) return { status: "skipped", reason: "not_a_youtube_channel_url" };
  try {
    return await ingestYouTubePage(env, creatorId, creatorUrl) as unknown as Record<string, unknown>;
  } catch (error) {
    const result = { status: "failed", error: error instanceof Error ? error.message.slice(0, 250) : "YouTube metadata import failed" };
    console.warn(JSON.stringify({ event: "creator_youtube_import_failed", creatorId, message: result.error }));
    return result;
  }
}

async function runCreatorSetupAgents(env: Env, creatorId: string, creatorUrl: string, platform: "youtube" | "instagram" | "other") {
  const rows = await env.DB.prepare("SELECT id FROM content_items WHERE creator_id=? AND processing_status='ready' ORDER BY created_at DESC LIMIT 25").bind(creatorId).all<{ id: string }>();
  const contentIds = (rows.results || []).map((row) => row.id);
  const jobs = creatorOnboardingJobs(creatorUrl, platform, contentIds);
  const tasks: Array<{ roleKey: string; taskId?: string; status: string; error?: string }> = [];
  for (const job of jobs) {
    try {
      const submitted = await submitTask(env, {
        creatorId,
        roleKey: job.roleKey,
        initiatorType: "system",
        initiatorId: "creator-onboarding",
        input: { ...job.input, trigger: "creator-onboarding", sourceUrl: creatorUrl },
        idempotencyKey: `creator-onboarding:${creatorId}:${job.roleKey}`,
        priority: 3,
      });
      if (submitted.created) await dispatchTask(env, submitted.task.id);
      const current = await getTask(env, submitted.task.id);
      tasks.push({ roleKey: job.roleKey, taskId: submitted.task.id, status: current?.status || submitted.task.status });
    } catch (error) {
      tasks.push({ roleKey: job.roleKey, status: "failed", error: error instanceof Error ? error.message : "Agent could not be started" });
    }
  }
  return tasks;
}

async function adminRoute(
  request: Request,
  env: Env,
  path: string[],
): Promise<Response> {
  if (
    env.APP_ENV === "local" &&
    request.method === "POST" &&
    path[0] === "local-session"
  )
    return reply(
      { ok: true, mode: "local" },
      200,
      "cap_local_admin=1; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=86400",
    );
  const role = await getAdminRole(request, env);
  if (!role) return fail("Unauthorized", 401);
  if (role === "analyst" && request.method !== "GET")
    return fail("Read-only admin role", 403);
  if (
    role !== "owner" &&
    ["revenue", "entitlements"].includes(path[0] || "") &&
    request.method !== "GET"
  )
    return fail("Owner role required", 403);
  if (
    request.method === "PATCH" &&
    path[0] === "experiments" &&
    path[1] &&
    path[2]
  ) {
    const input = z
      .object({ status: z.enum(["draft", "active", "paused", "complete"]) })
      .parse(await body(request));
    const existing = await env.DB.prepare(
      "SELECT id FROM experiments WHERE creator_id=? AND id=?",
    )
      .bind(path[1], path[2])
      .first();
    if (!existing) return fail("Experiment not found", 404);
    if (
      input.status === "active" &&
      (await env.DB.prepare(
        "SELECT 1 FROM experiments WHERE creator_id=? AND id!=? AND feature=(SELECT feature FROM experiments WHERE id=? AND creator_id=?) AND status='active'",
      )
        .bind(path[1], path[2], path[2], path[1])
        .first())
    )
      return fail("Another experiment is active for this feature", 409);
    await env.DB.prepare(
      "UPDATE experiments SET status=? WHERE creator_id=? AND id=?",
    )
      .bind(input.status, path[1], path[2])
      .run();
    return reply({ ok: true, status: input.status });
  }
  if (request.method === "GET" && path[0] === "affiliate" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT a.id,a.slug,a.label,a.destination_host,a.placement,a.active,COUNT(c.id) AS clicks FROM affiliate_links a LEFT JOIN affiliate_clicks c ON c.creator_id=a.creator_id AND c.link_id=a.id WHERE a.creator_id=? GROUP BY a.id ORDER BY a.slug",
    )
      .bind(path[1])
      .all();
    return reply(rows.results);
  }
  if (request.method === "GET" && path[0] === "campaigns" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT id,brand,starts_at,ends_at,placements_json,status FROM campaigns WHERE creator_id=? ORDER BY rowid DESC LIMIT 100",
    )
      .bind(path[1])
      .all<{
        id: string;
        brand: string;
        starts_at: string | null;
        ends_at: string | null;
        placements_json: string;
        status: string;
      }>();
    return reply(
      rows.results.map((row) => ({
        id: row.id,
        brand: row.brand,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        placements: json(row.placements_json),
        status: row.status,
      })),
    );
  }
  if (
    request.method === "PATCH" &&
    path[0] === "campaigns" &&
    path[1] &&
    path[2]
  ) {
    const input = z
      .object({ status: z.enum(["draft", "active", "paused", "complete"]) })
      .parse(await body(request));
    const result = await env.DB.prepare(
      "UPDATE campaigns SET status=? WHERE creator_id=? AND id=?",
    )
      .bind(input.status, path[1], path[2])
      .run();
    return result.meta.changes
      ? reply({ ok: true, status: input.status })
      : fail("Campaign not found", 404);
  }
  if (request.method === "GET" && path[0] === "revenue" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT id,source,gross_amount,currency,fees,refunds,direct_costs,net_amount,status,occurred_at FROM revenue_events WHERE creator_id=? ORDER BY occurred_at DESC LIMIT 100",
    )
      .bind(path[1])
      .all();
    return reply(rows.results);
  }
  if (path[0] === "agent" && path[1] && request.method === "GET") {
    const creator = await env.DB.prepare(
      "SELECT agent_json FROM creators WHERE id=?",
    )
      .bind(path[1])
      .first<{ agent_json: string }>();
    if (!creator) return fail("Creator not found", 404);
    const agent = await env.DB.prepare(
      "SELECT id,instructions,prompt_version,model_policy,max_tokens,max_cost_usd FROM agents WHERE creator_id=? ORDER BY rowid LIMIT 1",
    )
      .bind(path[1])
      .first<{
        id: string;
        instructions: string;
        prompt_version: string;
        model_policy: string;
        max_tokens: number;
        max_cost_usd: number;
      }>();
    return reply({
      instructions:
        "Ground responses in tenant content and label general suggestions.",
      promptVersion: "cooking-v1",
      modelPolicy: "STANDARD",
      maxTokens: 220,
      maxCostUsd: 0.05,
      ...json<Record<string, unknown>>(creator.agent_json),
      ...(agent
        ? {
            id: agent.id,
            instructions: agent.instructions,
            promptVersion: agent.prompt_version,
            modelPolicy: agent.model_policy,
            maxTokens: agent.max_tokens,
            maxCostUsd: agent.max_cost_usd,
          }
        : {}),
    });
  }
  if (path[0] === "agent" && path[1] && request.method === "PATCH") {
    const input = z
      .object({
        instructions: z.string().min(20).max(2000),
        modelPolicy: z.enum(["CHEAP", "STANDARD", "REASONING"]),
        maxTokens: z.number().int().min(50).max(1000),
        maxCostUsd: z.number().min(0.001).max(0.05),
        enabledTools: z.array(agentToolSchema).min(1).max(5),
      })
      .parse(await body(request));
    if (new Set(input.enabledTools).size !== input.enabledTools.length)
      return fail("Duplicate tools", 422);
    if (!input.enabledTools.includes("searchCreatorKnowledge"))
      return fail("Knowledge search is required for grounded answers", 422);
    const creator = await env.DB.prepare(
      "SELECT category,agent_json FROM creators WHERE id=?",
    )
      .bind(path[1])
      .first<{ category: string; agent_json: string }>();
    if (!creator) return fail("Creator not found", 404);
    const existing = await env.DB.prepare(
      "SELECT id FROM agents WHERE creator_id=? ORDER BY rowid LIMIT 1",
    )
      .bind(path[1])
      .first<{ id: string }>();
    const agentId = existing?.id || id();
    const agentJson = {
      ...json<Record<string, unknown>>(creator.agent_json),
      id: agentId,
      role: creator.category,
      promptVersion: "cooking-v1",
      ...input,
    };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO agents(id,creator_id,role,instructions,prompt_version,model_policy,memory_policy,safety_policy,max_tokens,max_cost_usd) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET instructions=excluded.instructions,model_policy=excluded.model_policy,max_tokens=excluded.max_tokens,max_cost_usd=excluded.max_cost_usd",
      ).bind(
        agentId,
        path[1],
        creator.category,
        input.instructions,
        "cooking-v1",
        input.modelPolicy,
        "adult-preferences-only",
        "no-medical-or-allergy-assurances",
        input.maxTokens,
        input.maxCostUsd,
      ),
      env.DB.prepare(
        "DELETE FROM agent_tools WHERE creator_id=? AND agent_id=?",
      ).bind(path[1], agentId),
      ...input.enabledTools.map((tool) =>
        env.DB.prepare(
          "INSERT INTO agent_tools(creator_id,agent_id,tool_name) VALUES(?,?,?)",
        ).bind(path[1], agentId, tool),
      ),
      env.DB.prepare("UPDATE creators SET agent_json=? WHERE id=?").bind(
        JSON.stringify(agentJson),
        path[1],
      ),
    ]);
    return reply({ ok: true, agent: agentJson });
  }
  if (request.method === "POST" && path[0] === "scout" && path[1]) {
    const input = z
      .object({
        url: z.string().url(),
        manualFacts: z.array(factSchema).max(100).optional(),
      })
      .parse(await body(request));
    const creator = await env.DB.prepare(
      "SELECT id,category FROM creators WHERE id=?",
    )
      .bind(path[1])
      .first<{ id: string; category: string }>();
    if (!creator) return fail("Creator not found", 404);
    return reply(
      await runScout(env, {
        creatorId: creator.id,
        category: creator.category,
        url: input.url,
        manualFacts: input.manualFacts,
      }),
      201,
    );
  }
  if (request.method === "GET" && path[0] === "specs" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT id,version,review_status,spec_json,created_at FROM product_specs WHERE creator_id=? ORDER BY created_at DESC LIMIT 50",
    )
      .bind(path[1])
      .all<{
        id: string;
        version: number;
        review_status: string;
        spec_json: string;
        created_at: string;
      }>();
    return reply(
      rows.results.map((row) => ({
        id: row.id,
        version: row.version,
        reviewStatus: row.review_status,
        spec: json(row.spec_json),
        createdAt: row.created_at,
      })),
    );
  }
  if (request.method === "PATCH" && path[0] === "specs" && path[1] && path[2]) {
    const input = z
      .object({ reviewStatus: z.enum(["approved", "rejected"]) })
      .parse(await body(request));
    const result = await env.DB.prepare(
      "UPDATE product_specs SET review_status=? WHERE creator_id=? AND id=? AND review_status='pending_review'",
    )
      .bind(input.reviewStatus, path[1], path[2])
      .run();
    return result.meta.changes
      ? reply({ ok: true, reviewStatus: input.reviewStatus })
      : fail("Spec not pending review", 404);
  }
  if (
    request.method === "POST" &&
    path[0] === "youtube" &&
    path[1] &&
    path[2] === "ingest"
  ) {
    const input = z
      .object({
        channelId: z.string().optional(),
        channelUrl: z.string().url().optional(),
      })
      .refine((value) => !!value.channelId || !!value.channelUrl, {
        message: "A YouTube channel URL or channel ID is required",
      })
      .parse(await body(request));
    const creator = await env.DB.prepare("SELECT id FROM creators WHERE id=?")
      .bind(path[1])
      .first();
    if (!creator) return fail("Creator not found", 404);
    return reply(
      await ingestYouTubePage(env, path[1], input.channelUrl || input.channelId!),
    );
  }
  if (request.method === "GET" && path[0] === "creators") {
    const rows = await env.DB.prepare(
      "SELECT id,slug,name,category,status,domain,brand_json,agent_json,monetization_json FROM creators ORDER BY name",
    ).all<{
      id: string;
      slug: string;
      name: string;
      category: string;
      status: string;
      domain: string | null;
      brand_json: string;
      agent_json: string;
      monetization_json: string;
    }>();
    return reply(rows.results.map((row) => creatorFromRow(row)));
  }
  if (request.method === "POST" && path[0] === "creator-setup") {
    const input = z.object({
      sourceUrl: z.string().url().refine((value) => value.startsWith("https://"), "Use an HTTPS creator channel or profile URL"),
      displayName: z.string().min(2).max(120).optional(),
    }).parse(await body(request));
    const sourceUrl = new URL(input.sourceUrl).toString();
    const platform = sourcePlatform(sourceUrl);
    if (platform === "youtube" && !isYouTubeChannelRef(sourceUrl)) return fail("Use a YouTube channel URL, such as https://www.youtube.com/@creator", 422);
    const existing = await env.DB.prepare("SELECT id,slug,name FROM creators WHERE domain=?").bind(sourceUrl).first<{ id: string; slug: string; name: string }>();
    const identity = sourceIdentity(sourceUrl);
    const creator = existing || await provisionCreator(env, {
      slug: await uniqueCreatorSlug(env, identity.slug),
      name: input.displayName || identity.name,
      creatorUrl: sourceUrl,
      category: "cooking",
      brand: {
        accent: "#b85c3b",
        hero: "What can we make today?",
        disclaimer: "Creator content is shown with source and rights status.",
      },
      enabledTools: ["searchCreatorKnowledge", "findSubstitution", "calculateServings", "createMealPlan", "createShoppingList"],
    });
    const contentImport = await importCreatorMetadata(env, creator.id, sourceUrl);
    const tasks = await runCreatorSetupAgents(env, creator.id, sourceUrl, platform);
    return reply({
      ...creator,
      platform,
      existing: Boolean(existing),
      contentImport,
      tasks,
      onboarding: { requestedRoleCount: SPECIALIST_ROLE_KEYS.length, dispatchedRoleCount: tasks.filter((task) => task.taskId).length },
      pwaUrl: `/creator/${creator.slug}`,
    }, existing ? 200 : 201);
  }
  if (request.method === "POST" && path[0] === "creators") {
    const input = z
      .object({
        slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
        name: z.string().min(2).max(120),
        creatorUrl: z.string().url().optional(),
        category: z.literal("cooking"),
        brand: z.object({
          accent: z.string().max(30),
          hero: z.string().max(200),
          disclaimer: z.string().min(10).max(300),
        }),
        enabledTools: z
          .array(
            z.enum([
              "searchCreatorKnowledge",
              "findSubstitution",
              "calculateServings",
              "createMealPlan",
              "createShoppingList",
            ]),
          )
          .default(["searchCreatorKnowledge", "findSubstitution"]),
      })
      .parse(await body(request));
    const creatorId = id();
    const agentId = id();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO creators(id,slug,name,category,status,domain,brand_json,agent_json,model_policy_json,monetization_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        creatorId,
        input.slug,
        input.name,
        input.category,
        "demo",
        input.creatorUrl || null,
        JSON.stringify(input.brand),
        JSON.stringify({
          id: agentId,
          role: input.category,
          enabledTools: input.enabledTools,
          instructions:
            "Ground responses in tenant content and label general suggestions.",
          promptVersion: "cooking-v1",
          modelPolicy: "STANDARD",
          maxTokens: 220,
          maxCostUsd: 0.05,
        }),
        JSON.stringify({ default: "STANDARD", maxCostUsd: 0.05 }),
        JSON.stringify({
          subscriptionEnabled: false,
          adsEnabled: false,
          affiliateEnabled: false,
        }),
      ),
      env.DB.prepare(
        "INSERT INTO agents(id,creator_id,role,instructions,prompt_version,model_policy,memory_policy,safety_policy) VALUES(?,?,?,?,?,?,?,?)",
      ).bind(
        agentId,
        creatorId,
        "cooking",
        "Ground responses in tenant content and label general suggestions.",
        "cooking-v1",
        "STANDARD",
        "adult-preferences-only",
        "no-medical-or-allergy-assurances",
      ),
      env.DB.prepare(
        "INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)",
      ).bind(creatorId, "AI_TEXT", "premium", 5, "day", 0),
      env.DB.prepare(
        "INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)",
      ).bind(creatorId, "AI_VOICE", "premium", null, "lifetime", 2),
      env.DB.prepare(
        "INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)",
      ).bind(creatorId, "SHOPPING_LIST", "premium", 0, "lifetime", 0),
      env.DB.prepare(
        "INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)",
      ).bind(creatorId, "MEAL_PLAN", "premium", 2, "lifetime", 0),
      env.DB.prepare(
        "INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,1)",
      ).bind(creatorId, "SAVE_CONTENT", "premium", 5, "lifetime", 0),
      env.DB.prepare(
        "INSERT INTO plans(id,creator_id,code,label,price_json) VALUES(?,?,?,?,?)",
      ).bind(id(), creatorId, "free", "Free", "{}"),
      env.DB.prepare(
        "INSERT INTO plans(id,creator_id,code,label,price_json) VALUES(?,?,?,?,?)",
      ).bind(id(), creatorId, "premium", "Premium", "{}"),
      env.DB.prepare(
        "INSERT INTO entitlements(id,creator_id,code,description) VALUES(?,?,?,?)",
      ).bind(id(), creatorId, "premium", "Premium cooking features"),
      ...input.enabledTools.map((tool) =>
        env.DB.prepare(
          "INSERT INTO agent_tools(creator_id,agent_id,tool_name) VALUES(?,?,?)",
        ).bind(creatorId, agentId, tool),
      ),
    ]);
    const contentImport = await importCreatorMetadata(env, creatorId, input.creatorUrl);
    return reply({ id: creatorId, slug: input.slug, contentImport }, 201);
  }
  if (request.method === "PATCH" && path[0] === "creators" && path[1]) {
    const input = z
      .object({
        name: z.string().min(2).max(120).optional(),
        brand: z
          .object({
            accent: z.string(),
            hero: z.string(),
            disclaimer: z.string(),
          })
          .optional(),
        creatorUrl: z.string().url().nullable().optional(),
        status: z.enum(["demo", "active", "paused"]).optional(),
      })
      .parse(await body(request));
    const existing = await env.DB.prepare(
      "SELECT name,domain,brand_json,status FROM creators WHERE id=?",
    )
      .bind(path[1])
      .first<{ name: string; domain: string | null; brand_json: string; status: string }>();
    if (!existing) return fail("Creator not found", 404);
    if (
      input.status === "active" &&
      !(await env.DB.prepare(
        "SELECT 1 FROM content_items WHERE creator_id=? AND processing_status='ready' AND rights_status IN ('creator_authorized','creator_uploaded','licensed') LIMIT 1",
      )
        .bind(path[1])
        .first())
    )
      return fail(
        "Activate only after approved creator content is available",
        422,
      );
    await env.DB.prepare(
      "UPDATE creators SET name=?,domain=?,brand_json=?,status=? WHERE id=?",
    )
      .bind(
        input.name || existing.name,
        input.creatorUrl === undefined ? existing.domain : input.creatorUrl,
        JSON.stringify(input.brand || json(existing.brand_json)),
        input.status || existing.status,
        path[1],
      )
      .run();
    return reply({ ok: true });
  }
  if (request.method === "GET" && path[0] === "content" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT id,title,description,source_url,rights_status,processing_status,structured_json FROM content_items WHERE creator_id=? ORDER BY created_at DESC LIMIT 100",
    )
      .bind(path[1])
      .all();
    return reply(rows.results);
  }
  if (
    request.method === "POST" &&
    path[0] === "content" &&
    path[1] &&
    !path[2]
  ) {
    const input = z
      .object({
        sourceUrl: z
          .string()
          .url()
          .refine((value) => value.startsWith("https://")),
        title: z.string().min(2).max(200),
        description: z.string().max(1000),
        thumbnailUrl: z
          .string()
          .url()
          .refine((value) => value.startsWith("https://"))
          .optional(),
        tags: z.array(z.string().min(1).max(40)).max(20).default([]),
        rightsStatus: z.enum([
          "creator_authorized",
          "creator_uploaded",
          "licensed",
        ]),
        meta: recipeMetaSchema,
      })
      .parse(await body(request));
    if (
      !(await env.DB.prepare("SELECT 1 FROM creators WHERE id=?")
        .bind(path[1])
        .first())
    )
      return fail("Creator not found", 404);
    const existing = await env.DB.prepare(
      "SELECT id FROM content_items WHERE creator_id=? AND source_url=?",
    )
      .bind(path[1], input.sourceUrl)
      .first<{ id: string }>();
    if (existing) return reply({ id: existing.id, alreadyImported: true });
    const sourceId = id();
    const contentId = id();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO content_sources(id,creator_id,source_type,source_url,external_id,rights_status,ingestion_status) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        sourceId,
        path[1],
        "operator_authorized",
        input.sourceUrl,
        input.sourceUrl,
        input.rightsStatus,
        "complete",
      ),
      env.DB.prepare(
        "INSERT INTO content_items(id,creator_id,source_id,external_id,source_url,title,description,thumbnail_url,content_type,structured_json,tags_json,provenance_json,rights_status,processing_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        contentId,
        path[1],
        sourceId,
        input.sourceUrl,
        input.sourceUrl,
        input.title,
        input.description,
        input.thumbnailUrl || null,
        "recipe",
        JSON.stringify(input.meta),
        JSON.stringify(input.tags),
        JSON.stringify({
          kind: "operator_supplied",
          note: "Structured metadata supplied by an operator; rights need review before publication",
          submittedAt: new Date().toISOString(),
        }),
        input.rightsStatus,
        "review",
      ),
    ]);
    return reply({ id: contentId, alreadyImported: false }, 201);
  }
  if (
    request.method === "PATCH" &&
    path[0] === "content" &&
    path[1] &&
    path[2]
  ) {
    const input = z
      .object({
        title: z.string().min(2).max(200).optional(),
        description: z.string().max(5000).optional(),
        rightsStatus: z
          .enum([
            "public_metadata",
            "creator_authorized",
            "creator_uploaded",
            "licensed",
            "AI_generated",
            "unknown_rights",
          ])
          .optional(),
        processingStatus: z.enum(["ready", "hidden", "review"]).optional(),
        meta: recipeMetaSchema.optional(),
      })
      .parse(await body(request));
    const existing = await env.DB.prepare(
      "SELECT title,description,rights_status,processing_status,structured_json,provenance_json FROM content_items WHERE id=? AND creator_id=?",
    )
      .bind(path[2], path[1])
      .first<{
        title: string;
        description: string;
        rights_status: string;
        processing_status: string;
        structured_json: string;
        provenance_json: string;
      }>();
    if (!existing) return fail("Content not found", 404);
    const rightsStatus = input.rightsStatus || existing.rights_status;
    const effectiveMeta =
      input.meta || json<{ ingredients?: unknown[] }>(existing.structured_json);
    if (
      rightsStatus === "public_metadata" &&
      (input.processingStatus || existing.processing_status) === "ready" &&
      (effectiveMeta.ingredients?.length || 0) > 0
    )
      return fail(
        "Review structured recipe metadata and rights before publication",
        422,
      );
    if (
      input.meta &&
      rightsStatus === "AI_generated" &&
      json<{ kind?: string }>(existing.provenance_json).kind !== "illustrative"
    )
      return fail(
        "External source metadata cannot be relabelled AI generated",
        422,
      );
    if (
      input.meta &&
      ![
        "creator_authorized",
        "creator_uploaded",
        "licensed",
        "AI_generated",
      ].includes(rightsStatus)
    )
      return fail("Structured recipe metadata needs authorized rights", 422);
    await env.DB.prepare(
      "UPDATE content_items SET title=?,description=?,rights_status=?,processing_status=?,structured_json=?,provenance_json=? WHERE id=? AND creator_id=?",
    )
      .bind(
        input.title || existing.title,
        input.description ?? existing.description,
        rightsStatus,
        input.processingStatus || existing.processing_status,
        input.meta ? JSON.stringify(input.meta) : existing.structured_json,
        input.meta
          ? JSON.stringify({
              kind:
                json<{ kind?: string }>(existing.provenance_json).kind ===
                "illustrative"
                  ? "illustrative"
                  : "operator_reviewed",
              note: "Structured metadata reviewed and updated by an operator",
              reviewedAt: new Date().toISOString(),
            })
          : existing.provenance_json,
        path[2],
        path[1],
      )
      .run();
    return reply({ ok: true });
  }
  if (request.method === "PUT" && path[0] === "gates" && path[1]) {
    const input = z
      .object({
        feature: z.string().max(60),
        requiredEntitlement: z.string().nullable(),
        freeUsageLimit: z.number().int().min(0).nullable(),
        resetPeriod: z.enum(["day", "lifetime"]),
        trialUsage: z.number().int().min(0).default(0),
        enabled: z.boolean(),
      })
      .parse(await body(request));
    await env.DB.prepare(
      "INSERT INTO feature_gates(creator_id,feature,required_entitlement,free_usage_limit,reset_period,trial_usage,enabled) VALUES(?,?,?,?,?,?,?) ON CONFLICT(creator_id,feature) DO UPDATE SET required_entitlement=excluded.required_entitlement,free_usage_limit=excluded.free_usage_limit,reset_period=excluded.reset_period,trial_usage=excluded.trial_usage,enabled=excluded.enabled",
    )
      .bind(
        path[1],
        input.feature,
        input.requiredEntitlement,
        input.freeUsageLimit,
        input.resetPeriod,
        input.trialUsage,
        Number(input.enabled),
      )
      .run();
    return reply({ ok: true });
  }
  if (request.method === "GET" && path[0] === "gates" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT feature,required_entitlement,free_usage_limit,reset_period,trial_usage,paywall_placement,enabled FROM feature_gates WHERE creator_id=? ORDER BY feature",
    )
      .bind(path[1])
      .all();
    return reply(rows.results);
  }
  if (request.method === "GET" && path[0] === "experiments" && path[1]) {
    const rows = await env.DB.prepare(
      "SELECT id,feature,variants_json,status FROM experiments WHERE creator_id=? ORDER BY feature",
    )
      .bind(path[1])
      .all<{
        id: string;
        feature: string;
        variants_json: string;
        status: string;
      }>();
    return reply(
      rows.results.map((row) => ({
        id: row.id,
        feature: row.feature,
        variants: json(row.variants_json),
        status: row.status,
      })),
    );
  }
  if (request.method === "POST" && path[0] === "experiments" && path[1]) {
    const input = z
      .object({
        feature: z.enum(["AI_TEXT", "AI_VOICE", "MEAL_PLAN"]),
        variants: z
          .array(
            z.object({
              key: z.string().regex(/^[a-zA-Z0-9_-]{1,30}$/),
              freeUsageLimit: z.number().int().min(0).max(100).optional(),
              trialUsage: z.number().int().min(0).max(100).optional(),
            }),
          )
          .min(2)
          .max(4),
        status: z.enum(["draft", "active"]).default("draft"),
      })
      .parse(await body(request));
    if (
      new Set(input.variants.map((variant) => variant.key)).size !==
      input.variants.length
    )
      return fail("Variant keys must be unique", 422);
    if (
      input.status === "active" &&
      (await env.DB.prepare(
        "SELECT 1 FROM experiments WHERE creator_id=? AND feature=? AND status='active'",
      )
        .bind(path[1], input.feature)
        .first())
    )
      return fail("An active experiment already exists for this feature", 409);
    const experimentId = id();
    await env.DB.prepare(
      "INSERT INTO experiments(id,creator_id,feature,variants_json,status) VALUES(?,?,?,?,?)",
    )
      .bind(
        experimentId,
        path[1],
        input.feature,
        JSON.stringify(input.variants),
        input.status,
      )
      .run();
    return reply({ id: experimentId }, 201);
  }
  if (request.method === "POST" && path[0] === "affiliate" && path[1]) {
    const input = z
      .object({
        slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
        destinationUrl: z.string().url(),
        campaignId: z.string().optional(),
        placement: z.string().max(80).optional(),
        label: z.string().min(2).max(120),
      })
      .parse(await body(request));
    const creator = await env.DB.prepare("SELECT id FROM creators WHERE id=?")
      .bind(path[1])
      .first();
    if (!creator) return fail("Creator not found", 404);
    let destination: URL;
    try {
      destination = new URL(input.destinationUrl);
      validateRedirect(input.destinationUrl, destination.hostname);
    } catch {
      return fail("Destination must be a safe HTTPS URL", 422);
    }
    const linkId = id();
    await env.DB.prepare(
      "INSERT INTO affiliate_links(id,creator_id,slug,destination_url,destination_host,campaign_id,placement,label) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        linkId,
        path[1],
        input.slug,
        input.destinationUrl,
        destination.hostname,
        input.campaignId || null,
        input.placement || null,
        input.label,
      )
      .run();
    return reply(
      {
        id: linkId,
        redirectPath: `/go/${(await env.DB.prepare("SELECT slug FROM creators WHERE id=?").bind(path[1]).first<{ slug: string }>())?.slug}/${input.slug}`,
        disclosureRequired: true,
      },
      201,
    );
  }
  if (request.method === "POST" && path[0] === "campaigns" && path[1]) {
    const input = z
      .object({
        brand: z.string().min(2).max(120),
        value: z.record(z.string(), z.unknown()),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
        placements: z.array(z.string().min(1).max(80)).min(1).max(20),
        status: z
          .enum(["draft", "active", "paused", "complete"])
          .default("draft"),
      })
      .parse(await body(request));
    const campaignId = id();
    await env.DB.prepare(
      "INSERT INTO campaigns(id,creator_id,brand,value_json,starts_at,ends_at,placements_json,status) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        campaignId,
        path[1],
        input.brand,
        JSON.stringify(input.value),
        input.startsAt || null,
        input.endsAt || null,
        JSON.stringify(input.placements),
        input.status,
      )
      .run();
    return reply({ id: campaignId }, 201);
  }
  if (request.method === "POST" && path[0] === "entitlements" && path[1]) {
    const input = z
      .object({
        userId: z.string().uuid(),
        code: z.string().max(50),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(await body(request));
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE creator_id=? AND id=?",
    )
      .bind(path[1], input.userId)
      .first();
    if (!user) return fail("User not found", 404);
    await env.DB.prepare(
      "INSERT INTO user_entitlements(creator_id,user_id,entitlement_code,provider,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(creator_id,user_id,entitlement_code) DO UPDATE SET expires_at=excluded.expires_at",
    )
      .bind(
        path[1],
        input.userId,
        input.code,
        "internal",
        input.expiresAt || null,
      )
      .run();
    return reply({ ok: true });
  }
  if (request.method === "GET" && path[0] === "metrics" && path[1]) {
    const creatorId = path[1];
    const [events, ai, revenue, visitorTotals, recentVisitors, dailyVisitors, sources, locations, devices, languages, pages] = await env.DB.batch([
      env.DB.prepare(
        "SELECT event_type,COUNT(*) count FROM events WHERE creator_id=? GROUP BY event_type",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT feature,SUM(estimated_cost_usd) cost,COUNT(*) requests,SUM(CASE WHEN status='unpriced' THEN 1 ELSE 0 END) unpriced_requests FROM ai_requests WHERE creator_id=? GROUP BY feature",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT source,currency,SUM(net_amount) net FROM revenue_events WHERE creator_id=? AND status IN ('confirmed','paid') GROUP BY source,currency",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view'",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days')",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT date(occurred_at) day,COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days') GROUP BY date(occurred_at) ORDER BY day",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT COALESCE(NULLIF(json_extract(metadata_json,'$.campaign.source'),''),NULLIF(json_extract(metadata_json,'$.referrerHost'),''),'Direct') source,COALESCE(json_extract(metadata_json,'$.campaign.medium'),'') medium,COALESCE(json_extract(metadata_json,'$.campaign.name'),'') campaign,COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days') GROUP BY source,medium,campaign ORDER BY views DESC LIMIT 10",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT CASE WHEN json_extract(metadata_json,'$.city') IS NOT NULL AND json_extract(metadata_json,'$.country') IS NOT NULL THEN json_extract(metadata_json,'$.city')||', '||json_extract(metadata_json,'$.country') WHEN json_extract(metadata_json,'$.city') IS NOT NULL THEN json_extract(metadata_json,'$.city') WHEN json_extract(metadata_json,'$.region') IS NOT NULL THEN json_extract(metadata_json,'$.region') WHEN json_extract(metadata_json,'$.country') IS NOT NULL THEN json_extract(metadata_json,'$.country') ELSE 'Unknown' END location,COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days') GROUP BY location ORDER BY views DESC LIMIT 10",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT COALESCE(json_extract(metadata_json,'$.device'),'Unknown') device,COALESCE(json_extract(metadata_json,'$.viewport'),'Unknown') viewport,COALESCE(json_extract(metadata_json,'$.browser'),'Unknown') browser,COALESCE(json_extract(metadata_json,'$.os'),'Unknown') os,COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days') GROUP BY device,viewport,browser,os ORDER BY views DESC LIMIT 10",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT COALESCE(json_extract(metadata_json,'$.language'),'Unknown') language,COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days') GROUP BY language ORDER BY views DESC LIMIT 10",
      ).bind(creatorId),
      env.DB.prepare(
        "SELECT COALESCE(json_extract(metadata_json,'$.pagePath'),'/creator')||' · '||COALESCE(json_extract(metadata_json,'$.screen'),'home') page,COUNT(*) views,COUNT(DISTINCT user_id) unique_visitors FROM events WHERE creator_id=? AND event_type='page_view' AND occurred_at>=datetime('now','-30 days') GROUP BY page ORDER BY views DESC LIMIT 10",
      ).bind(creatorId),
    ]);
    const visitorTotal = visitorTotals?.results?.[0] as
      | { views?: number; unique_visitors?: number }
      | undefined;
    return reply({
      events: events?.results || [],
      ai: ai?.results || [],
      confirmedRevenue: revenue?.results || [],
      visitors: {
        totalViews: visitorTotal?.views || 0,
        uniqueVisitors: visitorTotal?.unique_visitors || 0,
        last30Days: recentVisitors?.results?.[0] || { views: 0, unique_visitors: 0 },
        daily: dailyVisitors?.results || [],
        sources: sources?.results || [],
        locations: locations?.results || [],
        devices: devices?.results || [],
        languages: languages?.results || [],
        pages: pages?.results || [],
      },
    });
  }
  // Agent Task Management Routes
  if (request.method === "GET" && path[0] === "agent-roles") {
    const category = request.headers.get("x-category") as 'content' | 'consumer' | 'engineering' | 'operations' | undefined;
    const roles = await listRoles(env, category, true);
    return reply({ roles });
  }
  if (request.method === "POST" && path[0] === "agent-tasks" && path[1] && !path[2]) {
    const creatorId = path[1];
    const input = z
      .object({
        roleKey: z.string().min(1).max(80),
        initiatorType: z.enum(['admin', 'user', 'system', 'webhook']),
        initiatorId: z.string().min(1).max(100),
        input: z.record(z.string(), z.unknown()).default({}),
        idempotencyKey: z.string().min(1).max(200).optional(),
        priority: z.number().int().min(1).max(10).default(5),
        autoStart: z.boolean().default(true),
      })
      .parse(await body(request));
    const submission: TaskSubmission = {
      creatorId,
      roleKey: input.roleKey,
      initiatorType: input.initiatorType,
      initiatorId: input.initiatorId,
      input: input.input,
      idempotencyKey: input.idempotencyKey,
      priority: input.priority,
    };
    const { task, created, previousStatus } = await submitTask(env, submission);
    if (created && input.autoStart) {
      await dispatchTask(env, task.id);
      return reply({ task, created, previousStatus, dispatched: true }, 202);
    }
    return reply({ task, created, previousStatus, dispatched: false }, created ? 201 : 200);
  }
  if (request.method === "GET" && path[0] === "agent-tasks" && path[1] && path[2]) {
    if (path[3] === "handoffs") {
      const parentTask = await getTask(env, path[2]);
      if (!parentTask) return fail("Task not found", 404);
      if (parentTask.creatorId !== path[1]) return fail("Task does not belong to creator", 403);
      return reply({ handoffs: await listTaskHandoffs(env, parentTask.id) });
    }
    const taskId = path[2]!;
    const task = await getTask(env, taskId);
    if (!task) return fail("Task not found", 404);
    if (task.creatorId !== path[1]) return fail("Task does not belong to creator", 403);
    return reply({ task });
  }
  if (request.method === "GET" && path[0] === "agent-tasks" && path[1]) {
    const creatorId = path[1];
    const status = request.headers.get("x-status") as 'queued' | 'running' | 'awaiting_review' | 'completed' | 'failed' | 'cancelled' | undefined;
    const roleId = request.headers.get("x-role-id") || undefined;
    const tasks = await listTasks(env, { creatorId, status, roleId }, 50);
    return reply({ tasks });
  }
  if (
    request.method === "POST" &&
    path[0] === "agent-tasks" &&
    path[1] &&
    ((path[2] === "run" && path[3]) || (path[2] && path[3] === "run"))
  ) {
    const creatorId = path[1]!;
    // Canonical URL: /agent-tasks/:creatorId/:taskId/run.
    // Keep /agent-tasks/:creatorId/run/:taskId for compatibility.
    const taskId = path[2] === "run" ? path[3]! : path[2]!;
    const task = await getTask(env, taskId);
    if (!task) return fail("Task not found", 404);
    if (task.creatorId !== creatorId) return fail("Task does not belong to creator", 403);
    if (task.status !== 'queued' && task.status !== 'awaiting_review') {
      return fail(`Task cannot be run: ${task.status}`, 409);
    }
    if (env.AGENT_TASK_WORKFLOW || env.AGENT_TASK_QUEUE) {
      await dispatchTask(env, taskId);
      return reply({ taskId, status: 'queued', dispatched: true }, 202);
    }
    const execution = await runTaskById(env, taskId);
    return reply(execution, execution.status === 'failed' ? 500 : 200);
  }
  if (
    request.method === "POST" &&
    path[0] === "agent-tasks" &&
    path[1] &&
    path[2] &&
    path[3] === "approve"
  ) {
    const input = z.object({
      approverType: z.enum(['admin', 'creator', 'system']).default('admin'),
      approverId: z.string().min(1).max(100),
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().max(500).optional(),
    }).parse(await body(request));
    const task = await getTask(env, path[2]);
    if (!task) return fail("Task not found", 404);
    if (task.creatorId !== path[1]) return fail("Task does not belong to creator", 403);
    await env.DB.prepare(
      `INSERT INTO agent_task_approvals(id,task_id,approver_type,approver_id,decision,reason)
       VALUES(?,?,?,?,?,?)`
    ).bind(id(), task.id, input.approverType, input.approverId, input.decision, input.reason || null).run();
    if (input.decision === 'rejected') {
      await updateTaskStatus(env, task.id, 'cancelled', task.result || undefined, input.reason || 'Approval rejected');
      return reply({ taskId: task.id, status: 'cancelled' });
    }
    if (task.result) {
      const role = await env.DB.prepare("SELECT role_key FROM agent_roles WHERE id=?").bind(task.roleId).first<{ role_key: string }>();
      await updateTaskStatus(env, task.id, 'completed', task.result);
      const nextTaskId = role ? await advanceTaskHandoff(env, { ...task, status: 'completed' }, role.role_key, task.result) : undefined;
      return reply({ taskId: task.id, status: 'completed', nextTaskId });
    }
    await updateTaskStatus(env, task.id, 'queued');
    await dispatchTask(env, task.id);
    return reply({ taskId: task.id, status: 'queued', dispatched: true }, 202);
  }
  if (request.method === "POST" && path[0] === "data-quality" && path[1] === "check") {
    const input = z
      .object({
        creatorId: z.string().min(1),
        initiatorId: z.string().min(1).default('admin'),
      })
      .parse(await body(request));
    // Submit and immediately run a Data Quality Monitor task
    const { task, created } = await submitTask(env, {
      creatorId: input.creatorId,
      roleKey: 'data_quality_monitor',
      initiatorType: 'admin',
      initiatorId: input.initiatorId,
      input: { trigger: 'manual', timestamp: new Date().toISOString() },
      priority: 3,
    });
    if (task.status === 'queued') {
      await updateTaskStatus(env, task.id, 'running');
      const runId = await startTaskRun(env, task.id, 1);
      try {
        const { findings, summary } = await runDataQualityCheck(env, input.creatorId, task.id);
        await completeTaskRun(env, runId, { findings, summary }, {
          provider: 'deterministic', model: 'data-quality-v1',
          inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0,
        });
        await updateTaskStatus(env, task.id, 'completed', { findings, summary });
        return reply({ task: await getTask(env, task.id), created, findings, summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await failTaskRun(env, runId, message);
        await updateTaskStatus(env, task.id, 'failed', undefined, message);
        return fail(message, 500);
      }
    }
    return reply({ task, created, message: 'Task already existed' });
  }
  if (request.method === "GET" && path[0] === "data-quality" && path[1] === "findings") {
    const creatorId = path[2] || request.headers.get("x-creator-id");
    if (!creatorId) return fail("x-creator-id header required", 400);
    const severity = request.headers.get("x-severity") as 'info' | 'warning' | 'error' | undefined;
    const findingType = request.headers.get("x-finding-type") || undefined;
    const reviewed = request.headers.get("x-reviewed");
    const findings = await listDataQualityFindings(env, creatorId, {
      severity,
      findingType,
      reviewed: reviewed === 'true' ? true : reviewed === 'false' ? false : undefined,
    }, 100);
    return reply({ findings });
  }
  if (request.method === "POST" && path[0] === "revenue" && path[1]) {
    const input = z
      .object({
        source: z.enum(["ad", "affiliate", "sponsor", "premium", "commerce"]),
        gross: z.number().nonnegative(),
        fees: z.number().nonnegative().default(0),
        refunds: z.number().nonnegative().default(0),
        directCosts: z.number().nonnegative().default(0),
        currency: z.string().regex(/^[A-Z]{3}$/),
        status: z.literal("pending"),
        externalTransactionId: z.string().max(100),
        occurredAt: z.string().datetime(),
      })
      .parse(await body(request));
    const net = calculateNet(
      input.gross,
      input.fees,
      input.refunds,
      input.directCosts,
    );
    await env.DB.prepare(
      "INSERT INTO revenue_events(id,creator_id,source,gross_amount,currency,fees,refunds,direct_costs,net_amount,external_transaction_id,status,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id(),
        path[1],
        input.source,
        input.gross,
        input.currency,
        input.fees,
        input.refunds,
        input.directCosts,
        net,
        input.externalTransactionId,
        input.status,
        input.occurredAt,
      )
      .run();
    return reply({ net }, 201);
  }
  return fail("Admin route not found", 404);
}

export default {
  async queue(batch: MessageBatch<AgentQueueMessage>, env: Env): Promise<void> {
    await Promise.all(batch.messages.map(async (message) => {
      try {
        await runTaskById(env, message.body.taskId);
        // Business failures are persisted; retry only infrastructure exceptions.
        message.ack();
      } catch {
        message.retry({ delaySeconds: Math.min(300, 10 * Math.max(1, message.attempts)) });
      }
    }));
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const period = new Date(controller.scheduledTime).toISOString().slice(0, 13);
    const creators = await env.DB.prepare("SELECT id FROM creators WHERE status IN ('demo','active')").all<{ id: string }>();
    for (const creator of creators.results || []) {
      for (const roleKey of ['data_quality_monitor', 'cost_monitor'] as const) {
        const submitted = await submitTask(env, {
          creatorId: creator.id,
          roleKey,
          initiatorType: 'system',
          initiatorId: 'scheduler',
          input: { trigger: 'scheduled', scheduledPeriod: period },
          idempotencyKey: `scheduled:${roleKey}:${creator.id}:${period}`,
          priority: roleKey === 'data_quality_monitor' ? 4 : 6,
        });
        if (submitted.created) await dispatchTask(env, submitted.task.id);
      }
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (!checkOrigin(request, env)) return fail("Origin not allowed", 403);
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "go" && parts[1] && parts[2] && request.method === "GET")
        return affiliateRoute(env, parts[1], parts[2]);
      if (parts[0] === "api" && parts[1] === "admin")
        return adminRoute(request, env, parts.slice(2));
      if (parts[0] === "api" && parts[1])
        return tenantRoute(request, env, parts[1], parts.slice(2));
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof z.ZodError)
        return fail(
          "Invalid input: " +
            error.issues.map((issue) => issue.path.join(".")).join(", "),
          422,
        );
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      console.error(JSON.stringify({ event: "api_error", message }));
      return fail("Internal error", 500);
    }
  },
};
