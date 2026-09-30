/**
 * Tests for H2 — VP query reply permissions.
 *
 * Verifies that:
 *   - hq can reply to an HQ-addressed query
 *   - hq_viewer is denied even when calling the check directly
 *   - regional can reply to queries addressed to their own region
 *   - regional cannot reply to another region's query
 *   - branch can reply to queries addressed to their own branch
 *   - branch cannot reply to another branch's query
 *   - vp_service / ceo / accounts / hq_viewer are all denied
 *
 * These tests exercise canReplyToVpRecipient, which is the exact guard
 * used inside replyVpFlagAction — testing the helper tests the action.
 *
 * Run: npx tsx --env-file=.env.local test-vp-reply-permissions.ts
 */
import { canReplyToVpRecipient } from "./src/lib/vp-flags/permissions.ts";

let passed = 0;
let failed = 0;

function expect(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`PASS  ${name}`);
    passed++;
  } else {
    console.error(`FAIL  ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

// ── HQ-addressed recipient ────────────────────────────────────────────────────

const hqRecipient = { type: "hq" };

expect("hq can reply to HQ query",
  canReplyToVpRecipient({ role: "hq" }, hqRecipient), true);

expect("hq_viewer is denied HQ query",
  canReplyToVpRecipient({ role: "hq_viewer" }, hqRecipient), false);

expect("regional is denied HQ query",
  canReplyToVpRecipient({ role: "regional", region: "North" }, hqRecipient), false);

expect("branch is denied HQ query",
  canReplyToVpRecipient({ role: "branch", branch: "CO01B" }, hqRecipient), false);

expect("vp_service is denied HQ query",
  canReplyToVpRecipient({ role: "vp_service" }, hqRecipient), false);

expect("ceo is denied HQ query",
  canReplyToVpRecipient({ role: "ceo" }, hqRecipient), false);

expect("accounts is denied HQ query",
  canReplyToVpRecipient({ role: "accounts" }, hqRecipient), false);

// ── Regional-addressed recipient ──────────────────────────────────────────────

const northRecipient = { type: "regional", region: "North" };

expect("regional can reply to their own region query",
  canReplyToVpRecipient({ role: "regional", region: "North" }, northRecipient), true);

expect("regional is denied another region's query",
  canReplyToVpRecipient({ role: "regional", region: "South" }, northRecipient), false);

expect("hq is denied regional query",
  canReplyToVpRecipient({ role: "hq" }, northRecipient), false);

expect("hq_viewer is denied regional query",
  canReplyToVpRecipient({ role: "hq_viewer" }, northRecipient), false);

// ── Branch-addressed recipient ────────────────────────────────────────────────

const co01bRecipient = { type: "branch", branch: "CO01B" };

expect("branch can reply to their own branch query",
  canReplyToVpRecipient({ role: "branch", branch: "CO01B" }, co01bRecipient), true);

expect("branch is denied another branch's query",
  canReplyToVpRecipient({ role: "branch", branch: "TI01C" }, co01bRecipient), false);

expect("hq is denied branch query",
  canReplyToVpRecipient({ role: "hq" }, co01bRecipient), false);

expect("hq_viewer is denied branch query",
  canReplyToVpRecipient({ role: "hq_viewer" }, co01bRecipient), false);

// ── Unknown recipient type ────────────────────────────────────────────────────

expect("unknown recipient type is denied",
  canReplyToVpRecipient({ role: "hq" }, { type: "unknown" }), false);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
