import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentItem } from '../src/shared/types';
import { aggregateShopping, calculateNet, cleanContentTitle, evaluateGate, normalizeIngredient, rankContent, scaleIngredient, validateRedirect } from '../src/server/domain';
import { assertTool } from '../src/server/agent';
import { getContent } from '../src/server/db';

const item: ContentItem = { id: 'a', creatorId: 'one', title: 'Potato Rice Skillet', description: 'A quick dinner', sourceUrl: '/source/a', thumbnailUrl: null, tags: ['vegetarian'], meta: { minutes: 25, equipment: ['stovetop'], diet: ['vegetarian'], servings: 2, ingredients: [{ name: 'potato', quantity: 2, unit: 'each', category: 'vegetables' }, { name: 'rice', quantity: 100, unit: 'g', category: 'pantry' }] }, provenance: { kind: 'illustrative' }, rightsStatus: 'AI_generated', publishedAt: null };

test('ingredient ranking respects constraints and rights', () => {
  const match = rankContent([item, { ...item, id: 'hidden', rightsStatus: 'unknown_rights' }], { goal: 'dinner', ingredients: ['potatoes', 'rice'], equipment: ['no oven'], diet: ['vegetarian'], familySize: 2 });
  assert.equal(normalizeIngredient('potatoes'), 'potato');
  assert.equal(match.length, 1);
  assert.deepEqual(match[0]?.missing, []);
  assert.deepEqual(match[0]?.has, ['potato', 'rice']);
  assert.equal(rankContent([item], { goal: '', ingredients: [], equipment: [], diet: ['vegan'], familySize: 2 }).length, 0);
});
test('ingredient hints and creator-style titles are searchable', () => {
  const publicVideo = { ...item, id: 'public-video', title: '1000 se zyada Cake banaye | Janamashtami Special Panchamrit Cake', meta: { ...item.meta, ingredients: [], ingredientHints: ['paneer', 'cardamom'] } };
  const match = rankContent([publicVideo], { goal: '', ingredients: ['paneer'], equipment: [], diet: [], familySize: 2 });
  assert.equal(match[0]?.has[0], 'paneer');
  assert.equal(cleanContentTitle(publicVideo.title), 'Janamashtami Special Panchamrit Cake');
});
test('servings and shopping totals are deterministic', () => {
  assert.equal(scaleIngredient(item.meta.ingredients[0]!, 2, 4).quantity, 4);
  const list = aggregateShopping([{ content: item, servings: 4 }, { content: item, servings: 2 }]);
  assert.equal(list.find((entry) => entry.name === 'potato')?.quantity, 6);
  assert.equal(list.find((entry) => entry.name === 'rice')?.quantity, 300);
});
test('free usage and entitlements are decided in code', () => {
  const gate = { requiredEntitlement: 'premium', freeUsageLimit: 2, trialUsage: 0, enabled: 1 };
  assert.equal(evaluateGate('AI_TEXT', gate, 1, []).allowed, true);
  assert.equal(evaluateGate('AI_TEXT', gate, 2, []).allowed, false);
  assert.equal(evaluateGate('AI_TEXT', gate, 999, ['premium']).allowed, true);
});
test('tool registry rejects disabled tools and execution over budget', () => {
  assert.throws(() => assertTool('createShoppingList', ['searchCreatorKnowledge'], 'cooking', 0, Date.now()));
  assert.throws(() => assertTool('searchCreatorKnowledge', ['searchCreatorKnowledge'], 'cooking', 4, Date.now()));
});
test('affiliate redirect blocks unsafe destinations', () => {
  assert.equal(validateRedirect('https://shop.example.com/product', 'shop.example.com').hostname, 'shop.example.com');
  assert.throws(() => validateRedirect('http://shop.example.com/product', 'shop.example.com'));
  assert.throws(() => validateRedirect('https://evil.example.com/product', 'shop.example.com'));
});
test('revenue net subtracts all direct deductions', () => {
  assert.equal(calculateNet(100, 5, 10, 20), 65);
  assert.throws(() => calculateNet(100, -1, 0, 0));
});
test('content lookup binds creator and content id', async () => {
  let sql = ''; let bindings: unknown[] = [];
  const db = { prepare(query: string) { sql = query; return { bind(...args: unknown[]) { bindings = args; return { async first() { return null; } }; } }; } } as unknown as D1Database;
  assert.equal(await getContent(db, 'creator-one', 'content-two'), null);
  assert.match(sql, /creator_id=\?/);
  assert.deepEqual(bindings, ['creator-one', 'content-two']);
});
