import assert from "node:assert/strict";
import test from "node:test";
import { roleRequiresReview, SPECIALIST_ROLE_KEYS } from "../src/server/specialistAgents";

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
