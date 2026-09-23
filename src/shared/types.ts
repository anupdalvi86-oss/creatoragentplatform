export type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  category: "vegetables" | "dairy" | "pantry" | "protein" | "spices" | "other";
};
export type RecipeMeta = {
  minutes: number;
  prepMinutes?: number;
  difficulty?: "Easy" | "Medium" | "Hard";
  nutrition?: { calories: number; protein: number; carbs: number; fat: number };
  nutritionSource?: string;
  equipment: string[];
  diet: string[];
  servings: number;
  ingredients: Ingredient[];
  ingredientHints?: string[];
  mealType?: "main" | "side" | "lunch";
};
export type ContentItem = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  tags: string[];
  meta: RecipeMeta;
  provenance: { kind: string; note?: string };
  rightsStatus: string;
  publishedAt: string | null;
};
export type Creator = {
  id: string;
  slug: string;
  name: string;
  creatorUrl?: string;
  category: string;
  status: string;
  brand: { accent: string; hero: string; disclaimer: string };
  agent: {
    id?: string;
    role: string;
    enabledTools: string[];
    instructions?: string;
    promptVersion?: string;
    modelPolicy?: "CHEAP" | "STANDARD" | "REASONING";
    maxTokens?: number;
    maxCostUsd?: number;
  };
  monetization: Record<string, boolean>;
};
export type Match = {
  content: ContentItem;
  has: string[];
  missing: string[];
  score: number;
  why: string;
  creatorMentionedSubstitutions: string[];
  aiAlternatives: string[];
};
export type GroundedAnswer = {
  answer: string;
  sourceContentIds: string[];
  aiGenerated: boolean;
  confidence: number;
  warnings: string[];
  label:
    | "CREATOR SOURCE"
    | "SAMPLE SOURCE"
    | "AI-GENERATED SUGGESTION"
    | "GENERAL SUGGESTION";
  matches: Match[];
  toolsUsed: string[];
};
export type CanMakeInput = {
  goal: string;
  ingredients: string[];
  equipment: string[];
  diet: string[];
  maxMinutes?: number;
  familySize: number;
};
export type GateResult = {
  allowed: boolean;
  feature: string;
  requiredEntitlement?: string;
  paywallContext?: string;
  previewData?: unknown;
  remaining?: number;
};
