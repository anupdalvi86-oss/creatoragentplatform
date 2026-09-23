import assert from "node:assert/strict";
import test from "node:test";
import { roleRequiresReview, SPECIALIST_ROLE_KEYS } from "../src/server/specialistAgents";
import { creatorOnboardingJobs } from "../src/server/creatorOnboarding";

test("every selected non-excluded specialist role has a handler key", () => {
  assert.equal(SPECIALIST_ROLE_KEYS.length, 32);
  assert.equal(new Set(SPECIALIST_ROLE_KEYS).size, SPECIALIST_ROLE_KEYS.length);
  for (const role of SPECIALIST_ROLE_KEYS) assert.match(role, /^[a-z_]+$/);
});

test("review boundaries apply to effects, not ordinary consumer operations", () => {
  assert.equal(roleRequiresReview("content_repurposing"), true);
  assert.equal(roleRequiresReview("cooking_assistant"), false);
  assert.equal(roleRequiresReview("cost_monitor"), false);
});

test("creator onboarding fans out exactly once to every selected role", () => {
  const jobs = creatorOnboardingJobs("https://www.youtube.com/@creator", "youtube", ["content-1", "content-2"]);
  assert.equal(jobs.length, 32);
  assert.deepEqual(jobs.map((job) => job.roleKey), SPECIALIST_ROLE_KEYS);
  assert.deepEqual(jobs.find((job) => job.roleKey === "youtube_ingestion")?.input, { channelUrl: "https://www.youtube.com/@creator" });
  assert.deepEqual(jobs.find((job) => job.roleKey === "source_verifier")?.input, { sourceContentIds: ["content-1", "content-2"] });
  assert.deepEqual(jobs.find((job) => job.roleKey === "orchestrator")?.input, { roleFanout: true });
});
