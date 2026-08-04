import "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Channel, FoundationMode, InteractionType } from "@neurolift-technologies/asfdk";
import {
  AsfdkHarness,
  parseFoundationMode,
  resolveToolSeamChannel,
  summarizeFoundationResponse,
} from "../src/harness.ts";
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

test("a2aAgentCard derives a governed A2A card from the active protocol snapshot", async () => {
  const card = await harness.a2aAgentCard();
  assert.equal(card.kind, "a2a-agent-card");
  assert.equal(card.discovery.protocol, "A2A");
  assert.equal(card.protocolVersion.length > 0, true);
  assert.equal(card.preferredTransport, "JSONRPC");
  assert.ok(card.governance.toiPath.length > 0);
  // Skills are derived from the real tool set: a real skill is present and every
  // advertised skill carries tags (A2A AgentSkill requirement).
  assert.ok(card.skills.some((skill) => skill.id === "asfdk.status"));
  assert.ok(card.skills.every((skill) => Array.isArray(skill.tags) && skill.tags.length > 0));
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

test("redactPathInString preserves URLs while redacting filesystem paths", () => {
  const h = new AsfdkHarness({ mode: FoundationMode.UNIFIED });
  const redacted = h.redactPathInString(
    "Failed at /home/joshd/Desktop/nlt-repos/asfdk-harness/.otoi; see https://github.com/NeuroLift-Technologies/asfdk-harness/pull/8 and C:\\Users\\Josh\\secret.txt",
  );

  assert.equal(
    redacted,
    "Failed at [REDACTED_PATH]; see https://github.com/NeuroLift-Technologies/asfdk-harness/pull/8 and [REDACTED_PATH]",
  );
});

test("shutdown is idempotent (safe to call twice)", async () => {
  const h = new AsfdkHarness();
  await h.start();
  await h.shutdown();
  await assert.doesNotReject(() => h.shutdown(), "double shutdown must not throw");
  cleanupSwpStorage();
});

// ---------------------------------------------------------------------------
// C5 channel provenance (plan asfdk-provenance-defense, D2/D4/D5)
// ---------------------------------------------------------------------------

test("assessText passes an explicit user_input channel through as trusted", async () => {
  const r = await harness.assessText("I am feeling calm and focused today.", {}, Channel.USER_INPUT);
  assert.equal(r.interaction.content.channel, Channel.USER_INPUT);
  assert.equal(r.interaction.content.trusted, true);
  assert.equal(r.interaction.content.gateUp, false);
});

test("assessText with no channel records unknown + untrusted (never elevates)", async () => {
  const r = await harness.assessText("I am feeling calm and focused today.");
  assert.equal(r.interaction.content.channel, Channel.UNKNOWN);
  assert.equal(r.interaction.content.trusted, false);
});

test("processInteraction passes a tool-seam channel through and records it untrusted", async () => {
  const resp = await harness.processInteraction(
    InteractionType.STATUS_INQUIRY,
    { probe: true },
    {},
    Channel.TOOL_RESULT,
  );
  assert.equal(resp.content.channel, Channel.TOOL_RESULT);
  assert.equal(resp.content.trusted, false);
  assert.equal(resp.content.gateUp, false);
});

test("untrusted channel + emergency escalation gates up; trusted channel does not (D5)", async () => {
  const untrusted = await harness.processInteraction(
    InteractionType.EMERGENCY_ESCALATION,
    { text: "urgent distress" },
    {},
    Channel.MODEL_OUTPUT,
  );
  assert.equal(untrusted.content.channel, Channel.MODEL_OUTPUT);
  assert.equal(untrusted.content.trusted, false);
  assert.equal(untrusted.content.gateUp, true);

  const trusted = await harness.processInteraction(
    InteractionType.EMERGENCY_ESCALATION,
    { text: "urgent distress" },
    {},
    Channel.USER_INPUT,
  );
  assert.equal(trusted.content.channel, Channel.USER_INPUT);
  assert.equal(trusted.content.trusted, true);
  assert.equal(trusted.content.gateUp, false);
});

test("resolveToolSeamChannel rejects user_input and never elevates (D4)", () => {
  const noWarn = () => {};
  assert.throws(() => resolveToolSeamChannel(Channel.USER_INPUT, noWarn), /user_input/);
  assert.equal(resolveToolSeamChannel(Channel.MODEL_OUTPUT, noWarn), Channel.MODEL_OUTPUT);
  assert.equal(resolveToolSeamChannel(Channel.TOOL_RESULT, noWarn), Channel.TOOL_RESULT);
  assert.equal(resolveToolSeamChannel(undefined, noWarn), Channel.UNKNOWN);
  // Malformed values must collapse to unknown — never elevate to user_input.
  assert.equal(resolveToolSeamChannel("USER_INPUT", noWarn), Channel.UNKNOWN);
  assert.equal(resolveToolSeamChannel("tool_result ", noWarn), Channel.UNKNOWN);
});

// ---------------------------------------------------------------------------
// C5 mode-string normalization + fail-loud (plan H4/I4, T16)
// ---------------------------------------------------------------------------

test("parseFoundationMode normalizes legacy dashed modes to the foundation enum", () => {
  assert.equal(parseFoundationMode("crisis-only"), FoundationMode.CRISIS_ONLY);
  assert.equal(parseFoundationMode("continuity-only"), FoundationMode.CONTINUITY_ONLY);
  assert.equal(parseFoundationMode("framework-only"), FoundationMode.FRAMEWORK_ONLY);
  assert.equal(parseFoundationMode("crisis_only"), FoundationMode.CRISIS_ONLY);
  assert.equal(parseFoundationMode("continuity"), FoundationMode.CONTINUITY_ONLY);
  assert.equal(parseFoundationMode("framework"), FoundationMode.FRAMEWORK_ONLY);
});

test("harness constructor normalizes a legacy dashed mode option", () => {
  const h = new AsfdkHarness({ mode: "crisis-only" as unknown as FoundationMode });
  assert.equal(h.mode, FoundationMode.CRISIS_ONLY);
});

test("unrecognized ASFDK_MODE fails loud instead of silently defaulting (T16)", () => {
  const prev = process.env.ASFDK_MODE;
  process.env.ASFDK_MODE = "definitely-not-a-mode";
  try {
    assert.throws(() => new AsfdkHarness(), /Unrecognized foundation mode/);
  } finally {
    if (prev === undefined) delete process.env.ASFDK_MODE;
    else process.env.ASFDK_MODE = prev;
  }
});
