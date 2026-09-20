import type { Env } from './db';
import { id } from './db';

export type Policy = 'CHEAP' | 'STANDARD' | 'REASONING';
export type AIRequest = { creatorId: string; agentId?: string; feature: string; task: string; policy: Policy; prompt: string; fallback: string; maxTokens: number; maxCostUsd: number };
export type AIResult = { text: string; provider: string; model: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number; fallbackUsed: boolean };
interface AIProvider { name: string; generate(request: AIRequest, env: Env, signal: AbortSignal): Promise<AIResult> }
type ModelPrice = { inputPerMillion: number; outputPerMillion: number };
function priceFor(env: Env, model: string): ModelPrice {
  const all = env.AI_PRICING_JSON ? JSON.parse(env.AI_PRICING_JSON) as Record<string, ModelPrice> : {};
  const price = all[model];
  if (!price || !Number.isFinite(price.inputPerMillion) || !Number.isFinite(price.outputPerMillion) || price.inputPerMillion < 0 || price.outputPerMillion < 0) throw new Error(`AI pricing missing for ${model}`);
  return price;
}
const estimateCost = (price: ModelPrice, input: number, output: number) => (input * price.inputPerMillion + output * price.outputPerMillion) / 1_000_000;
class MockProvider implements AIProvider {
  name = 'mock';
  async generate(request: AIRequest): Promise<AIResult> { return { text: request.fallback, provider: 'mock', model: 'deterministic-v1', inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, fallbackUsed: false }; }
}
class OpenAIProvider implements AIProvider {
  name = 'openai';
  async generate(request: AIRequest, env: Env, signal: AbortSignal): Promise<AIResult> {
    if (!env.OPENAI_API_KEY) throw new Error('OpenAI key not configured');
    const model = request.policy === 'CHEAP' ? env.AI_MODEL_CHEAP : request.policy === 'REASONING' ? env.AI_MODEL_REASONING : env.AI_MODEL_STANDARD;
    const price = priceFor(env, model);
    if (estimateCost(price, Math.ceil(request.prompt.length / 3), request.maxTokens) > request.maxCostUsd) throw new Error('AI cost ceiling exceeded');
    const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, store: false, max_completion_tokens: request.maxTokens, messages: [{ role: 'system', content: 'Use only the supplied source facts. State when evidence is insufficient. Never claim the creator authored this answer. Keep under 100 words.' }, { role: 'user', content: request.prompt }] }) });
    if (!response.ok) throw new Error(`AI provider status ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty AI response');
    const inputTokens = body.usage?.prompt_tokens || 0;
    const outputTokens = body.usage?.completion_tokens || 0;
    return { text, provider: 'openai', model, inputTokens, outputTokens, estimatedCostUsd: estimateCost(price, inputTokens, outputTokens), fallbackUsed: false };
  }
}
const providers: Record<string, AIProvider> = { mock: new MockProvider(), openai: new OpenAIProvider() };
export async function generateAI(env: Env, request: AIRequest): Promise<AIResult> {
  const started = Date.now();
  let result: AIResult | undefined;
  let status = 'failed';
  const deadline = started + 8000;
  const names = [...new Set([env.AI_PRIMARY || 'mock', env.AI_FALLBACK || 'mock', 'mock'])];
  for (const name of names) {
    const provider = providers[name];
    if (!provider) continue;
    for (let attempt = 0; attempt < (name === 'mock' ? 1 : 2); attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0 && name !== 'mock') break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(4000, Math.max(1, remaining)));
      try {
        result = await provider.generate(request, env, controller.signal);
        result.fallbackUsed = name !== names[0];
        if (result.fallbackUsed) console.warn(JSON.stringify({ event: 'ai_provider_fallback', creatorId: request.creatorId, provider: name }));
        status = 'ok';
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        console.warn(JSON.stringify({ event: 'ai_provider_failure', creatorId: request.creatorId, provider: name, attempt: attempt + 1, message }));
        if (/not configured|pricing missing|cost ceiling|status 4(?!29)/i.test(message)) break;
      } finally { clearTimeout(timer); }
    }
    if (result) break;
  }
  result ||= await new MockProvider().generate(request);
  const requestId = id();
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO ai_requests(id,creator_id,agent_id,feature,task,policy,provider,model,status,latency_ms,estimated_cost_usd) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(requestId, request.creatorId, request.agentId || null, request.feature, request.task, request.policy, result.provider, result.model, status, Date.now() - started, result.estimatedCostUsd),
      env.DB.prepare('INSERT INTO ai_usage(id,creator_id,request_id,input_tokens,output_tokens,estimated_cost_usd) VALUES(?,?,?,?,?,?)').bind(id(), request.creatorId, requestId, result.inputTokens, result.outputTokens, result.estimatedCostUsd)
    ]);
  } catch (error) { console.error(JSON.stringify({ event: 'ai_usage_write_failed', creatorId: request.creatorId, message: error instanceof Error ? error.message : 'unknown' })); }
  return result;
}
