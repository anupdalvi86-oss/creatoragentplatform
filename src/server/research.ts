import { z } from 'zod';
import type { Env } from './db';
import { id } from './db';
import { resolveYouTubeChannelId } from './youtube';

export const factSchema = z.object({ type: z.string().min(2).max(80), value: z.unknown(), source: z.string().min(2).max(100), sourceUrl: z.string().url().optional(), retrievedAt: z.string().datetime(), confidence: z.number().min(0).max(1), verificationStatus: z.enum(['VERIFIED','INFERRED','UNKNOWN']) }).refine((fact) => fact.verificationStatus !== 'VERIFIED' || !!fact.sourceUrl, { message: 'Verified facts require a source URL' });
export type CreatorFact = z.infer<typeof factSchema> & { creatorId: string };
export type ResearchInput = { creatorId: string; url: string; category: string; manualFacts?: Array<z.infer<typeof factSchema>> };
export interface CreatorResearchProvider { name: string; research(input: ResearchInput, env: Env): Promise<CreatorFact[]> }

export class ManualImportProvider implements CreatorResearchProvider {
  name = 'manual';
  async research(input: ResearchInput): Promise<CreatorFact[]> { return (input.manualFacts || []).map((fact) => ({ ...factSchema.parse(fact), creatorId: input.creatorId })); }
}
export class YouTubeOfficialProvider implements CreatorResearchProvider {
  name = 'youtube-official';
  async research(input: ResearchInput, env: Env): Promise<CreatorFact[]> {
    if (!env.YOUTUBE_API_KEY) return [];
    const { channelId, channelUrl } = await resolveYouTubeChannelId(input.url);
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.search = new URLSearchParams({ part: 'snippet,statistics', id: channelId, key: env.YOUTUBE_API_KEY }).toString();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`YouTube API status ${response.status}`);
    const data = await response.json() as { items?: Array<{ snippet?: { title?: string; description?: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }> };
    const channel = data.items?.[0];
    if (!channel) return [];
    const now = new Date().toISOString();
    const sourceUrl = channelUrl;
    const facts: CreatorFact[] = [];
    if (channel.snippet?.title) facts.push({ creatorId: input.creatorId, type: 'channel_title', value: channel.snippet.title, source: 'YouTube Data API', sourceUrl, retrievedAt: now, confidence: 1, verificationStatus: 'VERIFIED' });
    if (channel.snippet?.description) facts.push({ creatorId: input.creatorId, type: 'channel_description', value: channel.snippet.description.slice(0, 2000), source: 'YouTube Data API', sourceUrl, retrievedAt: now, confidence: 1, verificationStatus: 'VERIFIED' });
    if (channel.statistics?.subscriberCount && !channel.statistics.hiddenSubscriberCount) facts.push({ creatorId: input.creatorId, type: 'subscriber_count_rounded', value: Number(channel.statistics.subscriberCount), source: 'YouTube Data API (rounded public value)', sourceUrl, retrievedAt: now, confidence: 0.95, verificationStatus: 'VERIFIED' });
    return facts;
  }
}
export class AgentReachProvider implements CreatorResearchProvider {
  name = 'agent-reach-bridge';
  async research(input: ResearchInput, env: Env): Promise<CreatorFact[]> {
    if (!env.AGENT_REACH_URL) return [];
    const endpoint = new URL(env.AGENT_REACH_URL);
    if (endpoint.protocol !== 'https:') throw new Error('Agent Reach bridge must use HTTPS');
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.AGENT_REACH_TOKEN ? { Authorization: `Bearer ${env.AGENT_REACH_TOKEN}` } : {}) }, body: JSON.stringify({ creatorUrl: input.url, creatorId: input.creatorId, permittedSourcesOnly: true }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Agent Reach bridge status ${response.status}`);
    const parsed = z.object({ facts: z.array(factSchema).max(100) }).parse(await response.json());
    return parsed.facts.map((fact) => ({ ...fact, creatorId: input.creatorId }));
  }
}
export class WebResearchProvider implements CreatorResearchProvider {
  name = 'web-research';
  async research(): Promise<CreatorFact[]> { return []; }
}
export type ProductOpportunity = { creatorId: string; audienceProblem: string; audienceSummary: string; contentSummary: string; evidence: string[]; proposedProduct: string; jobsToBeDone: string[]; differentiation: string; monetizationOptions: string[]; premiumHooks: string[]; affiliateOpportunities: string[]; sponsorSurfaces: string[]; competition: string[]; technicalFeasibility: string; confidence: number; assumptions: string[]; risks: string[]; assessment: 'HYPOTHESIS' };
export type ProductSpec = { creator: string; vertical: string; productName: string; problem: string; targetUsers: string[]; coreFeatures: string[]; freeFeatures: string[]; premiumFeatures: string[]; premiumHooks: string[]; requiredAgentTools: string[]; knowledgeSources: string[]; monetization: string[]; branding: Record<string, unknown>; requiredModules: string[]; customModules: string[]; AIRequirements: string[]; risks: string[]; reviewStatus: 'pending_review' };
export function discoverOpportunity(creatorId: string, category: string, facts: CreatorFact[]): { opportunity: ProductOpportunity; spec: ProductSpec; monetizationHypothesis: { options: string[]; confidence: number; evidence: string[] } } {
  const evidence = facts.filter((fact) => fact.verificationStatus === 'VERIFIED').map((fact) => `${fact.type}: ${fact.sourceUrl || fact.source} (${fact.retrievedAt})`);
  const audienceSignal = facts.find((fact) => fact.type === 'audience_signal')?.value;
  const contentSignal = facts.find((fact) => fact.type === 'content_theme')?.value;
  const theme = facts.find((fact) => fact.type === 'recurring_theme')?.value || contentSignal;
  const themeText = typeof theme === 'string' ? theme : category;
  const audienceSummary = typeof audienceSignal === 'string' ? audienceSignal : 'No audience signal supplied yet. Add a sourced observation or survey result.';
  const contentSummary = typeof contentSignal === 'string' ? contentSignal : `No recurring content theme was verified; the current working category is ${category}.`;
  const opportunity: ProductOpportunity = { creatorId, audienceProblem: `People may need recurring, practical ${themeText} guidance.`, audienceSummary, contentSummary, evidence, proposedProduct: `${category} companion`, jobsToBeDone: [`Find relevant ${category} content`, 'Turn content into a useful repeatable workflow'], differentiation: 'Creator-grounded discovery with links to originals', monetizationOptions: ['subscription', 'one-time packs', 'affiliate where approved'], premiumHooks: ['saved plans', 'personalization', 'voice'], affiliateOpportunities: [], sponsorSurfaces: [], competition: [], technicalFeasibility: 'Requires authorized content and a category-specific workflow.', confidence: evidence.length ? 0.45 : 0.15, assumptions: ['Audience problem and willingness to pay are unverified.', 'Creator authorization is required before launch.'], risks: ['Sparse source coverage', 'Unverified demand', 'Rights and partnership requirements'], assessment: 'HYPOTHESIS' };
  const spec: ProductSpec = { creator: creatorId, vertical: category, productName: `${category[0]?.toUpperCase() || ''}${category.slice(1)} Companion`, problem: opportunity.audienceProblem, targetUsers: ['People who follow the creator and need repeat help'], coreFeatures: ['creator content discovery', 'source-grounded assistance'], freeFeatures: ['content search', 'basic source matches'], premiumFeatures: ['saved state', 'expanded planning'], premiumHooks: opportunity.premiumHooks, requiredAgentTools: ['searchCreatorKnowledge'], knowledgeSources: facts.map((fact) => fact.sourceUrl).filter((url): url is string => !!url), monetization: opportunity.monetizationOptions, branding: {}, requiredModules: ['tenant config', 'content', 'RAG', 'entitlements', 'analytics'], customModules: [category], AIRequirements: ['grounding', 'source links', 'cost ceiling'], risks: opportunity.risks, reviewStatus: 'pending_review' };
  return { opportunity, spec, monetizationHypothesis: { options: opportunity.monetizationOptions, confidence: opportunity.confidence, evidence } };
}
export async function runScout(env: Env, input: ResearchInput) {
  const providers: CreatorResearchProvider[] = [new ManualImportProvider(), new YouTubeOfficialProvider(), new AgentReachProvider(), new WebResearchProvider()];
  const outcomes = await Promise.allSettled(providers.map((provider) => provider.research(input, env)));
  const facts = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? outcome.value : []);
  const providerResults = outcomes.map((outcome, index) => ({ provider: providers[index]!.name, status: outcome.status, count: outcome.status === 'fulfilled' ? outcome.value.length : 0, error: outcome.status === 'rejected' ? String(outcome.reason).slice(0, 150) : undefined }));
  const runId = id();
  await env.DB.prepare('INSERT INTO research_runs(id,creator_id,input_url,provider_results_json,status) VALUES(?,?,?,?,?)').bind(runId, input.creatorId, input.url, JSON.stringify(providerResults), 'completed').run();
  for (const fact of facts) await env.DB.prepare('INSERT INTO creator_facts(id,creator_id,fact_type,value_json,source,source_url,retrieved_at,confidence,verification_status) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(), input.creatorId, fact.type, JSON.stringify(fact.value), fact.source, fact.sourceUrl || null, fact.retrievedAt, fact.confidence, fact.verificationStatus).run();
  const generated = discoverOpportunity(input.creatorId, input.category, facts);
  const opportunityId = id(); const specId = id();
  await env.DB.batch([env.DB.prepare('INSERT INTO product_opportunities(id,creator_id,opportunity_json) VALUES(?,?,?)').bind(opportunityId, input.creatorId, JSON.stringify({ ...generated.opportunity, monetizationHypothesis: generated.monetizationHypothesis })), env.DB.prepare('INSERT INTO product_specs(id,creator_id,opportunity_id,spec_json,review_status) VALUES(?,?,?,?,?)').bind(specId, input.creatorId, opportunityId, JSON.stringify(generated.spec), 'pending_review')]);
  return { runId, providerResults, facts, opportunity: generated.opportunity, productSpec: generated.spec, monetizationHypothesis: generated.monetizationHypothesis, reviewStatus: 'pending_review' };
}
