import assert from 'node:assert/strict';

const origin = new URL(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8787').origin;
const tenant = '/api/anyone-can-cook-demo';
let cookie = '';

async function request<T>(path: string, method = 'GET', data?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { origin } : {}), ...(cookie ? { cookie } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    redirect: 'manual',
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0]!;
  return { status: response.status, body: await response.json() as T };
}

const home = await fetch(origin);
assert.equal(home.status, 200, 'PWA shell');
const config = await request<{ slug: string }>(`${tenant}/config`);
assert.equal(config.body.slug, 'anyone-can-cook-demo');
const catalog = await request<{ items: Array<{ id: string }> }>(`${tenant}/content?q=paneer`);
assert.equal(catalog.status, 200);
assert.ok(catalog.body.items.some((item) => item.id === 'paneer-rice'));

const crossTenant = await request(`${tenant}/content/second-only`);
assert.equal(crossTenant.status, 404, 'tenant-owned content must stay isolated');
const secondTenant = await request('/api/second-creator-demo/content/second-only');
assert.equal(secondTenant.status, 200);

const answer = await request<{ sourceContentIds: string[]; matches: Array<{ content: { id: string } }> }>(`${tenant}/can-make`, 'POST', { goal: 'I have paneer and rice but no oven', ingredients: 'paneer, rice', equipment: ['no oven'], diet: ['vegetarian'], maxMinutes: 30, familySize: 2 });
assert.equal(answer.status, 200);
assert.ok(answer.body.sourceContentIds.includes('paneer-rice'), 'grounded match');
assert.ok(answer.body.matches.every((match) => answer.body.sourceContentIds.includes(match.content.id)));

const plan = await request<{ id: string; requestedDays: number; previewDays: number; items: Array<{ content: { id: string } }> }>(`${tenant}/plan`, 'POST', { days: 5, familySize: 2, diet: ['vegetarian'], equipment: ['no oven'], excludedIngredients: [], maxMinutes: 30 });
assert.equal(plan.status, 200);
assert.equal(plan.body.requestedDays, 5);
assert.equal(plan.body.previewDays, 2, 'free plan preview');
assert.equal(plan.body.items.length, 2);
assert.ok(plan.body.items.every((item) => !['lentil-tiffin', 'chickpea-wrap', 'airfryer-potatoes'].includes(item.content.id)), 'dinner classification');
const savedPlan = await request<{ id: string; items: unknown[] }>(`${tenant}/plan/${plan.body.id}`);
assert.equal(savedPlan.body.id, plan.body.id);
assert.equal(savedPlan.body.items.length, 2);

const shopping = await request<{ type: string; previewData: { count: number } }>(`${tenant}/shopping-list`, 'POST', { planId: plan.body.id });
assert.equal(shopping.status, 200);
assert.equal(shopping.body.type, 'FEATURE_GATE');
assert.ok(shopping.body.previewData.count > 0);

const voice = [];
for (let index = 0; index < 3; index++) voice.push(await request<{ allowed?: boolean; type?: string }>(`${tenant}/voice/authorize`, 'POST'));
assert.equal(voice[0]?.body.allowed, true);
assert.equal(voice[1]?.body.allowed, true);
assert.equal(voice[2]?.body.type, 'FEATURE_GATE');

const unauthorized = await request('/api/admin/creators');
assert.equal(unauthorized.status, 401);
if (process.env.SMOKE_ADMIN_TOKEN) {
  const admin = await fetch(`${origin}/api/admin/creators`, { headers: { authorization: `Bearer ${process.env.SMOKE_ADMIN_TOKEN}` } });
  assert.equal(admin.status, 200, 'local admin authentication');
}

console.log(JSON.stringify({ status: 'pass', checks: ['PWA shell', 'catalog', 'tenant isolation', 'grounded answer', 'plan persistence', 'dinner classification', 'shopping gate', 'voice trial', 'admin access rejection', ...(process.env.SMOKE_ADMIN_TOKEN ? ['admin token'] : [])] }));
