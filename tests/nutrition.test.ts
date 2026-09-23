import assert from "node:assert/strict";
import test from "node:test";
import type { ContentItem, RecipeMeta } from "../src/shared/types";
import { estimateNutrition, matchPantryRecipes, parseNutritionIngredients, recipeDifficulty } from "../src/client/nutrition";

const meta: RecipeMeta = {
  minutes: 20,
  equipment: [],
  diet: [],
  servings: 2,
  ingredients: [
    { name: "shrimp", quantity: 200, unit: "g", category: "protein" },
    { name: "corn tortilla", quantity: 4, unit: "each", category: "pantry" },
    { name: "avocado", quantity: 0.5, unit: "each", category: "vegetables" },
    { name: "lime", quantity: 1, unit: "each", category: "vegetables" },
  ],
};

test("nutrition is estimated per listed serving from recognized recipe ingredients", () => {
  const result = estimateNutrition(meta);
  assert.equal(result.complete, true);
  assert.equal(result.basis, "estimated");
  assert.deepEqual(result.perServing, { calories: 291, protein: 28, carbs: 32, fat: 8 });
});

test("nutrition estimate omits numeric confidence when ingredients cannot be measured", () => {
  const result = estimateNutrition({
    ...meta,
    ingredients: [...meta.ingredients, { name: "special sauce", quantity: 1, unit: "splash", category: "other" }],
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.unestimated, ["special sauce"]);
});

test("provided nutrition values take precedence and explicit difficulty is respected", () => {
  const result = estimateNutrition({ ...meta, nutrition: { calories: 400, protein: 25, carbs: 30, fat: 12 } });
  assert.equal(result.basis, "provided");
  assert.deepEqual(result.perServing, { calories: 400, protein: 25, carbs: 30, fat: 12 });
  assert.equal(recipeDifficulty({ ...meta, difficulty: "Medium" }), "Medium");
});

test("nutrition calculator parses common quantity formats and leaves vague quantities unestimated", () => {
  const parsed = parseNutritionIngredients("1/2 avocado\n1 tbsp olive oil\nButter to taste");
  assert.deepEqual(parsed.map(({ quantity, unit, name }) => ({ quantity, unit, name })), [
    { quantity: 0.5, unit: "each", name: "avocado" },
    { quantity: 1, unit: "tbsp", name: "olive oil" },
    { quantity: 1, unit: "unknown", name: "Butter" },
  ]);
  const result = estimateNutrition({ ...meta, ingredients: parsed });
  assert.equal(result.complete, false);
  assert.deepEqual(result.unestimated, ["Butter"]);
});

test("pantry matches rank recipes by owned ingredients and report missing ingredients", () => {
  const wrap: ContentItem = {
    id: "wrap", creatorId: "creator", title: "Chickpea Wrap", description: "", sourceUrl: "/wrap",
    thumbnailUrl: null, tags: [], meta: { ...meta, ingredients: [
      { name: "chickpeas", quantity: 1, unit: "cup", category: "protein" },
      { name: "tortilla", quantity: 1, unit: "each", category: "pantry" },
    ] }, provenance: { kind: "sample" }, rightsStatus: "AI_generated", publishedAt: null,
  };
  const bowl: ContentItem = {
    ...wrap, id: "bowl", title: "Potato Bowl", meta: { ...meta, ingredients: [
      { name: "potato", quantity: 1, unit: "each", category: "vegetables" },
      { name: "rice", quantity: 1, unit: "cup", category: "pantry" },
    ] },
  };
  const matches = matchPantryRecipes([bowl, wrap], ["chickpea", "tortilla"]);
  assert.deepEqual(matches.map(({ item }) => item.id), ["wrap"]);
  assert.deepEqual(matches[0]?.has, ["chickpeas", "tortilla"]);
  assert.deepEqual(matches[0]?.missing, []);
  assert.deepEqual(matchPantryRecipes([bowl, wrap], ["rice"])[0]?.missing, ["potato"]);
});

test("pantry matches source descriptions and ingredient hints when quantities are unavailable", () => {
  const pyazPakoda: ContentItem = {
    id: "pyaz-pakoda", creatorId: "creator", title: "Aloo Bhajiya", description: "Crispy pyaz pakoda for monsoon.",
    sourceUrl: "/pyaz-pakoda", thumbnailUrl: null, tags: [],
    meta: { ...meta, ingredients: [], ingredientHints: ["potato", "besan"] },
    provenance: { kind: "creator" }, rightsStatus: "creator_owned", publishedAt: null,
  };
  const matches = matchPantryRecipes([pyazPakoda], ["onion"]);
  assert.deepEqual(matches.map(({ item }) => item.id), ["pyaz-pakoda"]);
  assert.deepEqual(matches[0]?.has, ["onion"]);
  assert.deepEqual(matches[0]?.missing, []);
});
