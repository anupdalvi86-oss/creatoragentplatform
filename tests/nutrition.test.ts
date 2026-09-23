import assert from "node:assert/strict";
import test from "node:test";
import type { RecipeMeta } from "../src/shared/types";
import { estimateNutrition, parseNutritionIngredients, recipeDifficulty } from "../src/client/nutrition";

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
