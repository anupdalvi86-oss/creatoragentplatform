import type { Ingredient, RecipeMeta } from "../shared/types";

export type NutritionValues = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type NutritionEstimate = {
  perServing: NutritionValues;
  complete: boolean;
  unestimated: string[];
  basis: "estimated" | "provided";
};

type FoodProfile = NutritionValues & {
  gramsEach?: number;
  gramsPerCup?: number;
  gramsPerTbsp?: number;
  gramsPerTsp?: number;
};

// Generic ingredient averages per 100 g. These are estimates, not branded-food
// label values; actual ingredients and preparation can change the result.
const profiles: Record<string, FoodProfile> = {
  avocado: { calories: 160, protein: 2, carbs: 8.5, fat: 14.7, gramsEach: 150 },
  beans: { calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5, gramsPerCup: 170 },
  "bell pepper": { calories: 31, protein: 1, carbs: 6, fat: 0.3, gramsEach: 120, gramsPerCup: 149 },
  butter: { calories: 717, protein: 0.9, carbs: 0.1, fat: 81, gramsPerTbsp: 14, gramsPerTsp: 4.7 },
  cabbage: { calories: 25, protein: 1.3, carbs: 5.8, fat: 0.1, gramsPerCup: 89 },
  cilantro: { calories: 23, protein: 2.1, carbs: 3.7, fat: 0.5, gramsPerCup: 16 },
  chickpeas: { calories: 164, protein: 8.9, carbs: 27.4, fat: 2.6, gramsPerCup: 164 },
  corn: { calories: 86, protein: 3.3, carbs: 19, fat: 1.4, gramsPerCup: 145 },
  cucumber: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, gramsEach: 300, gramsPerCup: 104 },
  cumin: { calories: 375, protein: 18, carbs: 44, fat: 22, gramsPerTsp: 2.1 },
  garlic: { calories: 149, protein: 6.4, carbs: 33, fat: 0.5, gramsEach: 3 },
  "green cabbage": { calories: 25, protein: 1.3, carbs: 5.8, fat: 0.1, gramsPerCup: 89 },
  "black beans": { calories: 132, protein: 8.9, carbs: 23.7, fat: 0.5, gramsPerCup: 172 },
  cheddar: { calories: 403, protein: 25, carbs: 1.3, fat: 33, gramsPerCup: 113 },
  lime: { calories: 30, protein: 0.7, carbs: 10.5, fat: 0.2, gramsEach: 67 },
  lentils: { calories: 116, protein: 9, carbs: 20.1, fat: 0.4, gramsPerCup: 198 },
  "lime juice": { calories: 25, protein: 0.4, carbs: 8.4, fat: 0.1, gramsPerTbsp: 15 },
  jalapeno: { calories: 29, protein: 0.9, carbs: 6.5, fat: 0.4, gramsEach: 14 },
  jalapeño: { calories: 29, protein: 0.9, carbs: 6.5, fat: 0.4, gramsEach: 14 },
  lettuce: { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2, gramsPerCup: 36 },
  "olive oil": { calories: 884, protein: 0, carbs: 0, fat: 100, gramsPerTbsp: 13.5, gramsPerTsp: 4.5 },
  onion: { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, gramsEach: 110, gramsPerCup: 160 },
  paprika: { calories: 282, protein: 14.1, carbs: 53.9, fat: 12.9, gramsPerTsp: 2.3 },
  parsley: { calories: 36, protein: 3, carbs: 6.3, fat: 0.8, gramsPerCup: 60 },
  pasta: { calories: 371, protein: 13, carbs: 75, fat: 1.5 },
  paneer: { calories: 265, protein: 18, carbs: 1.2, fat: 20.8 },
  "plain yogurt": { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, gramsPerCup: 245 },
  potato: { calories: 77, protein: 2, carbs: 17.5, fat: 0.1, gramsEach: 173 },
  "red cabbage": { calories: 31, protein: 1.4, carbs: 7.4, fat: 0.2, gramsPerCup: 89 },
  rice: { calories: 365, protein: 7.1, carbs: 80, fat: 0.7, gramsPerCup: 185 },
  "cooked rice": { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, gramsPerCup: 158 },
  "brown rice": { calories: 367, protein: 7.5, carbs: 76, fat: 3.2, gramsPerCup: 195 },
  shrimp: { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, gramsEach: 12 },
  salsa: { calories: 36, protein: 1.5, carbs: 7, fat: 0.2, gramsPerCup: 260, gramsPerTbsp: 16 },
  salt: { calories: 0, protein: 0, carbs: 0, fat: 0, gramsPerTsp: 6 },
  sourcream: { calories: 198, protein: 2.4, carbs: 4.6, fat: 19, gramsPerTbsp: 12 },
  "sour cream": { calories: 198, protein: 2.4, carbs: 4.6, fat: 19, gramsPerTbsp: 12 },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, gramsEach: 123, gramsPerCup: 180 },
  tortilla: { calories: 218, protein: 5.7, carbs: 44.6, fat: 2.9, gramsEach: 28 },
  "corn tortilla": { calories: 218, protein: 5.7, carbs: 44.6, fat: 2.9, gramsEach: 28 },
  "wheat tortilla": { calories: 304, protein: 8.3, carbs: 49, fat: 8.3, gramsEach: 45 },
  turmeric: { calories: 312, protein: 9.7, carbs: 67, fat: 3.3, gramsPerTsp: 3 },
  water: { calories: 0, protein: 0, carbs: 0, fat: 0, gramsPerCup: 240 },
  "white beans": { calories: 139, protein: 9.7, carbs: 25, fat: 0.4, gramsPerCup: 179 },
  yogurt: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, gramsPerCup: 245 },
};

function keyOf(name: string): string {
  return name.toLowerCase().trim().replace(/\([^)]*\)/g, "").replace(/,.*$/, "").replace(/^(?:fresh|raw|large|medium|small|chopped|diced|shredded|sliced)\s+/i, "").replace(/\s+(?:fresh|raw|chopped|diced|shredded|sliced)$/i, "").replace(/\s+/g, " ");
}

export function parseNutritionIngredients(text: string): Ingredient[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+(?:\.\d+)?|\d+\/\d+|½|¼|¾)\s*(cups?|g|grams?|kg|ml|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|each|pieces?)?\s+(.+)$/i);
    const quantity = match?.[1] ? parseQuantity(match[1]) : 1;
    const unit = match?.[2]?.toLowerCase() || (match?.[3] ? "each" : "unknown");
    const name = (match?.[3] || line).trim().replace(/\s+(?:to taste|as needed)$/i, "");
    const normalized = keyOf(name);
    const category: Ingredient["category"] = /shrimp|chicken|fish|beef|pork|beans|lentils|chickpeas|egg|paneer/i.test(normalized)
      ? "protein"
      : /milk|yogurt|cheese|butter|cream/i.test(normalized)
        ? "dairy"
        : /salt|pepper|cumin|paprika|turmeric|coriander|spice|chili|chilli/i.test(normalized)
          ? "spices"
          : /oil|rice|pasta|tortilla|flour|sugar|quinoa/i.test(normalized)
            ? "pantry"
            : /avocado|cabbage|corn|cucumber|garlic|jalapeno|lime|onion|parsley|cilantro|potato|tomato|lettuce/i.test(normalized)
              ? "vegetables"
              : "other";
    return { name, quantity, unit, category };
  });
}

function parseQuantity(value: string): number {
  if (value === "½") return 0.5;
  if (value === "¼") return 0.25;
  if (value === "¾") return 0.75;
  if (value.includes("/")) {
    const [numerator, denominator] = value.split("/").map(Number);
    return denominator ? numerator! / denominator : 0;
  }
  return Number(value);
}

function gramsFor(ingredient: Ingredient, profile: FoodProfile): number | null {
  const unit = ingredient.unit.toLowerCase().trim();
  if ([profile.calories, profile.protein, profile.carbs, profile.fat].every((value) => value === 0)) return 0;
  if (["g", "gm", "gram", "grams"].includes(unit)) return ingredient.quantity;
  if (["kg", "kilogram", "kilograms"].includes(unit)) return ingredient.quantity * 1000;
  if (["ml", "milliliter", "milliliters"].includes(unit)) return ingredient.quantity;
  if (["oz", "ounce", "ounces"].includes(unit)) return ingredient.quantity * 28.3495;
  if (["lb", "lbs", "pound", "pounds"].includes(unit)) return ingredient.quantity * 453.592;
  if (["each", "piece", "pieces", "whole", "clove", "cloves"].includes(unit))
    return profile.gramsEach ? ingredient.quantity * profile.gramsEach : null;
  if (["cup", "cups"].includes(unit))
    return profile.gramsPerCup ? ingredient.quantity * profile.gramsPerCup : null;
  if (["tbsp", "tablespoon", "tablespoons"].includes(unit))
    return profile.gramsPerTbsp ? ingredient.quantity * profile.gramsPerTbsp : null;
  if (["tsp", "teaspoon", "teaspoons"].includes(unit))
    return profile.gramsPerTsp ? ingredient.quantity * profile.gramsPerTsp : null;
  return null;
}

export function estimateNutrition(meta: RecipeMeta): NutritionEstimate {
  if (meta.nutrition) {
    return {
      perServing: {
        calories: Math.round(meta.nutrition.calories),
        protein: Math.round(meta.nutrition.protein),
        carbs: Math.round(meta.nutrition.carbs),
        fat: Math.round(meta.nutrition.fat),
      },
      complete: true,
      unestimated: [],
      basis: "provided",
    };
  }
  const total: NutritionValues = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const unestimated: string[] = [];
  for (const ingredient of meta.ingredients) {
    const key = keyOf(ingredient.name);
    const profile = profiles[key];
    const grams = profile && gramsFor(ingredient, profile);
    if (!profile || grams === null || grams === undefined) {
      unestimated.push(ingredient.name);
      continue;
    }
    total.calories += profile.calories * grams / 100;
    total.protein += profile.protein * grams / 100;
    total.carbs += profile.carbs * grams / 100;
    total.fat += profile.fat * grams / 100;
  }
  const servings = Math.max(1, meta.servings || 1);
  return {
    perServing: {
      calories: Math.round(total.calories / servings),
      protein: Math.round(total.protein / servings),
      carbs: Math.round(total.carbs / servings),
      fat: Math.round(total.fat / servings),
    },
    complete: meta.ingredients.length > 0 && unestimated.length === 0,
    unestimated: [...new Set(unestimated)],
    basis: "estimated",
  };
}

export function recipeDifficulty(meta: RecipeMeta): "Easy" | "Medium" | "Hard" {
  if (meta.difficulty) return meta.difficulty;
  if (meta.minutes > 60 || meta.ingredients.length > 14) return "Hard";
  if (meta.minutes > 35 || meta.ingredients.length > 9) return "Medium";
  return "Easy";
}
