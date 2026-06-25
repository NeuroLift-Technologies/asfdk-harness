import "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { FoundationMode } from "@neurolift-technologies/asfdk";
import { AsfdkHarness, parseFoundationMode, summarizeFoundationResponse } from "../src/harness.ts";
import { cleanupSwpStorage, TEST_USER } from "./setup.ts";

let harness: AsfdkHarness;

before(async () => {
  harness = new AsfdkHarness();
  await harness.start();
});

after(async () => {
  await harness.shutdown();
  cleanupSwpStorage();
});

test("constructs with the test identity and unified mode", () => {
  assert.equal(harness.userId, TEST_USER);
  assert.equal(harness.mode, FoundationMode.UNIFIED);
  assert.equal(typeof harness.sessionId, "string");
  assert.ok(harness.sessionId.length > 0);
});

test("healthCheck reports all three Solidarity components active", async () => {
  const h = await harness.healthCheck();
  assert.equal(h.healthy, true);
  assert.equal(h.components.toi_otoi_framework.active, true);
  assert.equal(h.components.sleepwalker_protocol.active, true);
  assert.equal(h.components.rrt_advocate.active, true);
});

test("status merges foundation status with a real (loaded) protocol snapshot", async () => {
  const s = (await harness.status()) as Record<string, unknown>;
  assert.ok("components" in s);
  assert.ok("protocols" in s, "status() should include the protocol snapshot Codex wired in");
  // Assert the snapshot actually loaded — not just that the key exists (which would pass even
  // if protocol loading were broken and returned an empty/error object).
  const snapshot = s.protocols as { protocols?: unknown };
  assert.ok(
    snapshot && Array.isArray(snapshot.protocols),
    "protocol snapshot must expose a protocols array, proving it loaded",
  );
});

test("assessText returns an interaction and an emotionalState", async () => {
  const r = await harness.assessText("I am feeling calm and focused today.");
  assert.ok(r.interaction);
  assert.equal((r.interaction as { success?: boolean }).success, true);
  assert.ok("emotionalState" in r);
});

test("parseFoundationMode normalizes case/whitespace and rejects unknown values", () => {
  assert.equal(parseFoundationMode(FoundationMode.UNIFIED), FoundationMode.UNIFIED);
  assert.equal(parseFoundationMode(String(FoundationMode.UNIFIED).toUpperCase()), FoundationMode.UNIFIED);
  assert.equal(parseFoundationMode(`  ${FoundationMode.UNIFIED}  `), FoundationMode.UNIFIED);
  assert.equal(parseFoundationMode("definitely-not-a-mode"), undefined);
  assert.equal(parseFoundationMode(undefined), undefined);
});

test("summarizeFoundationResponse emits stable JSON fields", async () => {
  const resp = (await harness.assessText("hello")).interaction;
  const parsed = JSON.parse(summarizeFoundationResponse(resp));
  assert.ok("success" in parsed);
  assert.ok("responseType" in parsed);
  assert.ok("componentsInvolved" in parsed);
});

test("shutdown is idempotent (safe to call twice)", async () => {
  const h = new AsfdkHarness();
  await h.start();
  await h.shutdown();
  await assert.doesNotReject(() => h.shutdown(), "double shutdown must not throw");
  cleanupSwpStorage();
});
