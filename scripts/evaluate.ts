import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { GroundedAnswer } from '../src/shared/types';

type Case = { query: string; ingredients: string; equipment: string[]; diet: string[]; expectedSources: string[]; requiredFacts: string[]; forbiddenClaims: string[]; expectedTools: string[]; expectedProperties: { sourceRequired?: boolean; label?: string } };
const cases = JSON.parse(await readFile(new URL('../evals/cooking.json', import.meta.url), 'utf8')) as Case[];
const base = process.env.EVAL_BASE_URL || 'http://127.0.0.1:8787';
const slug = process.env.EVAL_CREATOR_SLUG || 'anyone-can-cook-demo';
let failed = 0;
for (const fixture of cases) {
  const started = performance.now();
  try {
    const response = await fetch(`${base}/api/${slug}/can-make`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: fixture.query, ingredients: fixture.ingredients, equipment: fixture.equipment, diet: fixture.diet, familySize: 2 }) });
    assert.equal(response.status, 200);
    const result = await response.json() as GroundedAnswer;
    for (const expected of fixture.expectedSources) assert.ok(result.sourceContentIds.includes(expected), `missing source ${expected}`);
    for (const fact of fixture.requiredFacts) assert.ok(result.answer.toLowerCase().includes(fact.toLowerCase()), `missing fact ${fact}`);
    for (const forbidden of fixture.forbiddenClaims) assert.ok(!result.answer.toLowerCase().includes(forbidden.toLowerCase()), `forbidden claim ${forbidden}`);
    for (const tool of fixture.expectedTools) assert.ok(result.toolsUsed.includes(tool), `missing tool ${tool}`);
    if (fixture.expectedProperties.sourceRequired) assert.ok(result.sourceContentIds.length > 0, 'ungrounded answer');
    if (fixture.expectedProperties.label) assert.equal(result.label, fixture.expectedProperties.label);
    console.log(JSON.stringify({ query: fixture.query, status: 'pass', latencyMs: Math.round(performance.now() - started), sources: result.sourceContentIds, tools: result.toolsUsed }));
  } catch (error) { failed++; console.error(JSON.stringify({ query: fixture.query, status: 'fail', error: error instanceof Error ? error.message : String(error) })); }
}
if (failed) process.exitCode = 1;
