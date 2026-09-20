import type {
  CanMakeInput,
  ContentItem,
  GroundedAnswer,
} from "../shared/types";
import type { Env } from "./db";
import { retrieveCreatorKnowledge } from "./retrieval";
import {
  deterministicAnswer,
  normalizeIngredient,
  rankContent,
  substitutions,
} from "./domain";
import { generateAI, type Policy } from "./ai";

export const PROMPTS = {
  "cooking-v1": (question: string, sources: ContentItem[]) =>
    `Question: ${question}\nAllowed source metadata: ${JSON.stringify(sources.map((s) => ({ id: s.id, title: s.title, description: s.description, ingredients: s.meta.ingredients, minutes: s.meta.minutes, sourceUrl: s.sourceUrl })))}\nAnswer using only this metadata. Say these are sample sources when provenance is illustrative. Do not invent steps, creator statements, or allergy assurances.`,
};
export type ToolDefinition = {
  name: string;
  description: string;
  verticals: string[];
  entitlement?: string;
  cost: "none" | "low";
  safety: string;
};
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  searchCreatorKnowledge: {
    name: "searchCreatorKnowledge",
    description: "Search tenant-approved content",
    verticals: ["cooking"],
    cost: "none",
    safety: "rights-filtered",
  },
  findSubstitution: {
    name: "findSubstitution",
    description: "Show labeled generic alternatives",
    verticals: ["cooking"],
    cost: "none",
    safety: "allergy-warning",
  },
  calculateServings: {
    name: "calculateServings",
    description: "Scale quantities",
    verticals: ["cooking"],
    cost: "none",
    safety: "positive-servings",
  },
  createMealPlan: {
    name: "createMealPlan",
    description: "Create grounded meal plan",
    verticals: ["cooking"],
    cost: "none",
    safety: "tenant-scoped",
  },
  createShoppingList: {
    name: "createShoppingList",
    description: "Aggregate plan ingredients",
    verticals: ["cooking"],
    entitlement: "premium",
    cost: "none",
    safety: "tenant-scoped",
  },
};
export function assertTool(
  name: string,
  enabled: string[],
  vertical: string,
  calls: number,
  started: number,
  maxCalls = 4,
): void {
  const tool = TOOL_REGISTRY[name];
  if (!tool || !enabled.includes(name) || !tool.verticals.includes(vertical))
    throw new Error("Tool unavailable");
  if (calls >= maxCalls || Date.now() - started > 10_000)
    throw new Error("Agent execution limit");
}
export async function canMake(
  env: Env,
  creator: {
    id: string;
    category: string;
    agent: {
      id?: string;
      enabledTools: string[];
      instructions?: string;
      modelPolicy?: Policy;
      maxTokens?: number;
      maxCostUsd?: number;
    };
  },
  input: CanMakeInput,
  useAI = true,
): Promise<GroundedAnswer> {
  const started = Date.now();
  assertTool(
    "searchCreatorKnowledge",
    creator.agent.enabledTools,
    creator.category,
    0,
    started,
  );
  const missingIngredient = input.goal
    .toLowerCase()
    .match(
      /(?:don't|dont|do not)\s+have\s+([a-z][a-z ]{1,30})(?:[?.!,]|$)/,
    )?.[1];
  if (
    missingIngredient &&
    /(?:substitut|replace|instead of)/i.test(input.goal) &&
    !/(?:replace|substitute(?: for)?|instead of)\s+[a-z ]{2,35}[?.!]?$/i.test(
      input.goal,
    )
  )
    input = { ...input, goal: `Can I replace ${missingIngredient}?` };
  const retrievalQuery = [input.goal, input.ingredients.join(", ")]
    .filter(Boolean)
    .join(" ");
  const retrieval = await retrieveCreatorKnowledge(env, creator.id, retrievalQuery);
  const candidates = retrieval.items;
  const substitutionIngredient = input.goal
    .toLowerCase()
    .match(
      /(?:replace|substitute(?: for)?|instead of)\s+([a-z ]{2,35})[?.!]?$/,
    )?.[1];
  if (substitutionIngredient) {
    assertTool(
      "findSubstitution",
      creator.agent.enabledTools,
      creator.category,
      1,
      started,
    );
    const ingredient = normalizeIngredient(substitutionIngredient);
    const idea = substitutions(ingredient);
    const suggestion = idea.alternatives.length
      ? `AI-recommended option: you could try ${idea.alternatives.join(" or ")}.`
      : "I could not find a reliable AI-recommended alternative for this ingredient.";
    return {
      answer: `No specific substitution for ${ingredient} was mentioned by the chef in the available sources. ${suggestion}`,
      sourceContentIds: [],
      aiGenerated: false,
      confidence: 0.1,
      warnings: [
        idea.warning,
      ],
      label: "GENERAL SUGGESTION",
      matches: [],
      toolsUsed: ["searchCreatorKnowledge", "findSubstitution"],
    };
  }
  const ranked = rankContent(candidates, input)
    .map((match) => ({
      ...match,
      score:
        match.score + (retrieval.semanticIds.has(match.content.id) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const viable = ranked.filter((match) => match.score >= 0 || match.has.length > 0);
  const pool = viable.length ? viable : ranked;
  const matches = pool
    .filter((match) => match.score >= pool[0]!.score - 3)
    .slice(0, 5);
  const fallback = deterministicAnswer(matches);
  if (!matches.length)
    return {
      answer: fallback,
      sourceContentIds: [],
      aiGenerated: false,
      confidence: 0,
      warnings: ["Insufficient matching source evidence."],
      label: "GENERAL SUGGESTION",
      matches: [],
      toolsUsed: ["searchCreatorKnowledge"],
    };
  const sources = matches.slice(0, 3).map((match) => match.content);
  const result = useAI
    ? await generateAI(env, {
        creatorId: creator.id,
        agentId: creator.agent.id,
        feature: "AI_TEXT",
        task: "grounded_can_make",
        policy: creator.agent.modelPolicy || "STANDARD",
        prompt: `${PROMPTS["cooking-v1"](input.goal, sources)}\nOperator instructions (subject to grounding rules): ${creator.agent.instructions || "Be concise and useful."}`,
        fallback,
        maxTokens: Math.min(220, creator.agent.maxTokens || 220),
        maxCostUsd: Math.min(0.05, creator.agent.maxCostUsd || 0.05),
      })
    : { text: fallback, provider: "mock", fallbackUsed: false };
  const sample = sources.some(
    (source) => source.provenance.kind === "illustrative",
  );
  return {
    answer: result.text,
    sourceContentIds: sources.map((source) => source.id),
    aiGenerated: result.provider !== "mock",
    confidence: Math.min(
      0.95,
      matches[0]!.has.length /
        Math.max(1, matches[0]!.content.meta.ingredients.length) +
        0.2,
    ),
    warnings: [
      ...(sample
        ? [
            "These are illustrative sample sources, not verified creator recipes.",
          ]
        : []),
      ...(!useAI
        ? ["Free AI allowance reached; showing a source-based match."]
        : []),
      ...(result.fallbackUsed
        ? [
            "AI provider unavailable; showing a deterministic source-based answer.",
          ]
        : []),
    ],
    label: sample ? "SAMPLE SOURCE" : "CREATOR SOURCE",
    matches,
    toolsUsed: ["searchCreatorKnowledge"],
  };
}
