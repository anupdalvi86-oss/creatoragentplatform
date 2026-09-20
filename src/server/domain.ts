import type { CanMakeInput, ContentItem, GateResult, Ingredient, Match } from '../shared/types';

const aliases: Record<string, string> = { potatoes: 'potato', tomatoes: 'tomato', peppers: 'bell pepper', pepper: 'bell pepper', 'bell peppers': 'bell pepper', capsicum: 'bell pepper', curd: 'yogurt', yoghurt: 'yogurt', rice: 'rice', paneer: 'paneer', cream: 'cream', chickpea: 'chickpeas', beans: 'white beans', lentil: 'lentils', flour: 'flour', atta: 'wheat flour', sugar: 'sugar', salt: 'salt', oil: 'oil', butter: 'butter', garlic: 'garlic', onion: 'onion', tomato: 'tomato', potato: 'potato' };
const goalStopWords = new Set(['can', 'could', 'make', 'cook', 'what', 'with', 'from', 'using', 'use', 'have', 'want', 'need', 'please', 'show', 'find', 'something', 'instead', 'of', 'for', 'me']);
export function normalizeIngredient(value: string): string {
  const cleaned = value.toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
  return aliases[cleaned] || cleaned.replace(/s$/, '');
}
export function parseIngredients(value: string): string[] {
  return [...new Set(value.split(/[,\n;]+|\band\b/i).map(normalizeIngredient).filter(Boolean))].slice(0, 30);
}
function ingredientMatches(left: string, right: string): boolean {
  const a = normalizeIngredient(left);
  const b = normalizeIngredient(right);
  return a === b || a.split(' ').includes(b) || b.split(' ').includes(a);
}
export function cleanContentTitle(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const segments = compact.split(/\s*(?:\||｜)\s*/).map((part) => part.trim()).filter(Boolean);
  const last = segments.at(-1) || compact;
  const title = segments.length > 1 && last.length >= 4 && /(?:[A-Za-z]|[\u0900-\u097F])/.test(last) ? last : compact;
  return title
    .replace(/^\s*(?:recipe|full recipe|how to make)\s*[:-–—]\s*/i, '')
    .replace(/\s+(?:#\w+\s*)+$/g, '')
    .trim();
}
export function safeContent(item: ContentItem): boolean {
  return item.rightsStatus !== 'unknown_rights';
}
export function rankContent(items: ContentItem[], input: CanMakeInput): Match[] {
  const have = new Set(input.ingredients.map(normalizeIngredient));
  const goal = input.goal.toLowerCase();
  const requestedDiet = input.diet.map((x) => x.toLowerCase());
  const goalWords = goal.split(/\W+/).filter((word) => word.length > 2 && !goalStopWords.has(word));
  return items.filter(safeContent).filter((item) => {
    if (input.maxMinutes && item.meta.minutes > input.maxMinutes) return false;
    if (requestedDiet.length && !requestedDiet.every((d) => item.meta.diet.includes(d))) return false;
    if (input.equipment.includes('no oven') && item.meta.equipment.includes('oven')) return false;
    if (input.equipment.includes('no air fryer') && item.meta.equipment.includes('air fryer')) return false;
    if (goalWords.length) {
      const searchable = `${item.title} ${item.description} ${item.tags.join(' ')} ${item.meta.ingredients.map((ingredient) => ingredient.name).join(' ')} ${(item.meta.ingredientHints || []).join(' ')}`.toLowerCase();
      if (!goalWords.some((word) => searchable.includes(word))) return false;
    }
    return true;
  }).map((content) => {
    const searchableIngredients = [
      ...content.meta.ingredients.map((ingredient) => ingredient.name),
      ...(content.meta.ingredientHints || []),
    ];
    const has = searchableIngredients
      .map((name) => normalizeIngredient(name))
      .filter((name, index, names) => names.indexOf(name) === index && [...have].some((owned) => ingredientMatches(owned, name)));
    const missing = content.meta.ingredients
      .map((ingredient) => normalizeIngredient(ingredient.name))
      .filter((name) => ![...have].some((owned) => ingredientMatches(owned, name)));
    const words = goalWords;
    const text = `${content.title} ${content.description} ${content.tags.join(' ')}`.toLowerCase();
    const topical = words.filter((word) => text.includes(word)).length;
    const score = has.length * 3 - missing.length + topical * 2 + (content.meta.minutes <= 30 ? 1 : 0);
    const why = has.length ? `Uses ${has.join(', ')} you have${missing.length ? `; needs ${missing.join(', ')}` : '; all listed ingredients are on hand'}.` : `Matches ${content.tags.slice(0, 2).join(' and ') || 'your search'}; check the ingredient list.`;
    return { content, has, missing, score, why, creatorMentionedSubstitutions: [], aiAlternatives: [] };
  }).sort((a, b) => b.score - a.score || a.content.title.localeCompare(b.content.title));
}
export function deterministicAnswer(matches: Match[]): string {
  if (!matches.length) return 'I could not find a matching source in this kitchen’s catalog. Try fewer constraints or browse the sample recipes.';
  const best = matches[0]!;
  const qualifier = best.missing.length ? `You would need ${best.missing.join(', ')}.` : 'You have all the listed ingredients.';
  return `${best.content.title} looks like the closest match. ${qualifier} It takes about ${best.content.meta.minutes} minutes. Open the source card for the full sample details.`;
}
export function substitutions(ingredient: string): { alternatives: string[]; warning: string } {
  const map: Record<string, string[]> = { cream: ['plain yogurt (tangier)', 'blended cashews (if safe for your household)'], yogurt: ['unsweetened plant yogurt'], paneer: ['firm tofu'], rice: ['quinoa'], potato: ['sweet potato'] };
  return { alternatives: map[normalizeIngredient(ingredient)] || [], warning: 'AI recommendation only; not a chef-mentioned substitution. Check allergies and cooking suitability.' };
}
export function scaleIngredient(ingredient: Ingredient, sourceServings: number, targetServings: number): Ingredient {
  if (sourceServings <= 0 || targetServings <= 0) throw new Error('Invalid servings');
  return { ...ingredient, quantity: Math.round(ingredient.quantity * targetServings / sourceServings * 100) / 100 };
}
export function aggregateShopping(recipes: Array<{ content: ContentItem; servings: number }>): Ingredient[] {
  const totals = new Map<string, Ingredient>();
  for (const { content, servings } of recipes) for (const raw of content.meta.ingredients) {
    const ingredient = scaleIngredient(raw, content.meta.servings, servings);
    const key = `${normalizeIngredient(ingredient.name)}|${ingredient.unit}`;
    const existing = totals.get(key);
    totals.set(key, { ...ingredient, name: normalizeIngredient(ingredient.name), quantity: Math.round(((existing?.quantity || 0) + ingredient.quantity) * 100) / 100 });
  }
  return [...totals.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
export function evaluateGate(feature: string, gate: { requiredEntitlement: string | null; freeUsageLimit: number | null; trialUsage: number; enabled: number }, used: number, entitlements: string[]): GateResult {
  if (!gate.enabled) return { allowed: false, feature, paywallContext: 'This feature is unavailable.' };
  if (!gate.requiredEntitlement || entitlements.includes(gate.requiredEntitlement)) return { allowed: true, feature };
  const allowance = gate.freeUsageLimit ?? gate.trialUsage;
  if (used < allowance) return { allowed: true, feature, remaining: allowance - used - 1 };
  return { allowed: false, feature, requiredEntitlement: gate.requiredEntitlement, paywallContext: 'Unlock this convenience with Premium.' };
}
export function validateRedirect(raw: string, approvedHost: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== approvedHost || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Invalid affiliate destination');
  return url;
}
export function calculateNet(gross: number, fees: number, refunds: number, directCosts: number): number {
  for (const n of [gross, fees, refunds, directCosts]) if (!Number.isFinite(n) || n < 0) throw new Error('Invalid revenue amount');
  return Math.round((gross - fees - refunds - directCosts) * 100) / 100;
}
