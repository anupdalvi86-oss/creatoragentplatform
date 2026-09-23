import { SPECIALIST_ROLE_KEYS, type SpecialistRoleKey } from "./specialistAgents";

export type CreatorOnboardingPlatform = "youtube" | "instagram" | "other";
export type CreatorOnboardingJob = { roleKey: SpecialistRoleKey; input: Record<string, unknown> };

export function creatorOnboardingJobs(
  creatorUrl: string,
  platform: CreatorOnboardingPlatform,
  contentIds: string[],
): CreatorOnboardingJob[] {
  const firstContentId = contentIds[0];
  const onboardingInput: Partial<Record<SpecialistRoleKey, Record<string, unknown>>> = {
    creator_scout: { url: creatorUrl, category: "cooking" },
    youtube_ingestion: platform === "youtube" ? { channelUrl: creatorUrl } : {},
    instagram_ingestion: { platform, sourceUrl: creatorUrl },
    transcription: {},
    translation: {},
    recipe_extraction: firstContentId ? { contentId: firstContentId } : {},
    content_librarian: {},
    rights_reviewer: {},
    source_verifier: { sourceContentIds: contentIds },
    content_repurposing: {},
    seo_metadata: {},
    cooking_assistant: { goal: "Find a quick recipe", ingredients: [], familySize: 2 },
    ingredient_substitution: { ingredient: "onion" },
    meal_planner: { days: 3, goal: "Plan meals from the creator's content", familySize: 2 },
    grocery_assistant: { contentIds: contentIds.slice(0, 3), servings: 2 },
    pantry_assistant: { ingredients: ["onion"], goal: "Find a recipe using available ingredients" },
    voice_assistant: {},
    personalization: {},
    learning_coach: {},
    support_assistant: { question: "What can this cooking PWA help me do?" },
    product_strategist: { goal: "Assess the initial creator PWA onboarding" },
    feature_designer: { goal: "Assess the initial creator PWA onboarding" },
    ui_ux_designer: { goal: "Assess the initial creator PWA onboarding", journey: "creator onboarding" },
    frontend_developer: { goal: "Assess the initial creator PWA onboarding" },
    backend_developer: { goal: "Assess the initial creator PWA onboarding" },
    workflow_tester: { goal: "Assess the initial creator PWA onboarding" },
    evaluation_agent: { goal: "Assess the initial creator PWA onboarding" },
    release_agent: { goal: "Assess the initial creator PWA onboarding" },
    orchestrator: { roleFanout: true },
    model_router: { policy: "STANDARD" },
    cost_monitor: {},
    data_quality_monitor: {},
  };

  return SPECIALIST_ROLE_KEYS.map((roleKey) => ({ roleKey, input: onboardingInput[roleKey] || {} }));
}
