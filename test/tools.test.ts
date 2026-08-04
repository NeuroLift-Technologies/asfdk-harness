import "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { AsfdkHarness, Channel } from "../src/harness.ts";
import { ASFDK_TOOL_SKILLS, createAsfdkTools, isSensitiveGovernanceToolName } from "../src/tools.ts";
import { cleanupSwpStorage } from "./setup.ts";

let harness: AsfdkHarness;
let tools: ReturnType<typeof createAsfdkTools>;

before(async () => {
  harness = new AsfdkHarness();
  await harness.start();
  tools = createAsfdkTools(harness);
});

after(async () => {
  await harness.shutdown();
  cleanupSwpStorage();
});

const byName = (name: string) => {
  const t = tools.find((tool) => tool.name === name);
  assert.ok(t, `tool ${name} should exist`);
  return t;
};

test("creates exactly the six ASFDK tools", () => {
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "asfdk_a2a_agent_card",
    "asfdk_assess_text",
    "asfdk_interop_protocols",
    "asfdk_protocol_status",
    "asfdk_status",
    "asfdk_update_preferences",
  ]);
});

test("authority chain uses the canonical tool name", () => {
  assert.equal(isSensitiveGovernanceToolName("asfdk_authority_chain"), true);
  assert.equal(isSensitiveGovernanceToolName("asfdk_authority_chan"), false);
  assert.ok(ASFDK_TOOL_SKILLS.some((skill) => skill.toolName === "asfdk_authority_chain"));
  assert.equal(ASFDK_TOOL_SKILLS.some((skill) => skill.toolName === "asfdk_authority_chan"), false);
});

test("every tool satisfies the Pi tool contract shape", () => {
  for (const t of tools) {
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.description, "string");
    assert.ok(t.parameters, `${t.name} should declare parameters`);
    assert.equal(typeof t.execute, "function");
  }
});

test("asfdk_status.execute returns health + status content", async () => {
  const r = await (byName("asfdk_status").execute as (id: string, p: unknown) => Promise<any>)("call-1", {});
  assert.ok(Array.isArray(r.content));
  assert.equal(r.content[0].type, "text");
  assert.equal(r.details.health.healthy, true);
});

test("asfdk_interop_protocols.execute returns third-party profiles (no foundation needed)", async () => {
  const r = await (byName("asfdk_interop_protocols").execute as (id: string, p: unknown) => Promise<any>)("call-2", {});
  assert.ok(Array.isArray(r.details.protocols));
  assert.ok(r.details.protocols.length > 0, "expected at least one interop protocol profile");
});

test("asfdk_a2a_agent_card.execute returns an A2A-ready agent card", async () => {
  const r = await (byName("asfdk_a2a_agent_card").execute as (id: string, p: unknown) => Promise<any>)("call-2a", {});
  assert.equal(r.details.kind, "a2a-agent-card");
  assert.equal(r.details.discovery.protocol, "A2A");
  assert.equal(r.details.preferredTransport, "JSONRPC");
  assert.ok(Array.isArray(r.details.skills));
  // Every advertised skill must map to a real Pi tool (no phantom skills).
  const toolSkillIds = new Set(tools.map((t) => t.name.replace(/^asfdk_/, "asfdk.")));
  assert.ok(r.details.skills.length > 0);
  for (const skill of r.details.skills as Array<{ id: string; tags?: unknown }>) {
    assert.ok(toolSkillIds.has(skill.id), `advertised skill ${skill.id} must map to a real tool`);
    assert.ok(Array.isArray(skill.tags) && skill.tags.length > 0, `skill ${skill.id} must declare tags`);
  }
});

test("asfdk_assess_text.execute runs an assessment", async () => {
  const r = await (byName("asfdk_assess_text").execute as (id: string, p: unknown) => Promise<any>)("call-3", {
    text: "checking in",
  });
  assert.ok(r.details.interaction, "expected an interaction in the assessment result");
});

// ---------------------------------------------------------------------------
// C5 D4 tool-seam channel restriction (plan asfdk-provenance-defense, D4)
// ---------------------------------------------------------------------------

test("asfdk_assess_text rejects user_input channel at the tool seam (D4) with warn telemetry", async () => {
  const execute = byName("asfdk_assess_text").execute as (id: string, p: unknown) => Promise<unknown>;
  const warns: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  try {
    await assert.rejects(
      () => execute("call-d4", { text: "checking in", channel: "user_input" }),
      /user_input/,
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(
    warns.some((args) => args.join(" ").includes("user_input")),
    "D4 rejection must emit warn telemetry",
  );
});

test("asfdk_assess_text passes an allowed tool-seam channel through", async () => {
  const r = await (byName("asfdk_assess_text").execute as (id: string, p: unknown) => Promise<any>)("call-3", {
    text: "checking in",
    channel: "tool_result",
  });
  const interaction = r.details.interaction as { content?: Record<string, unknown> };
  assert.equal(interaction.content?.channel, Channel.TOOL_RESULT);
  assert.equal(interaction.content?.trusted, false);
});

test("asfdk_assess_text defaults absent channel to unknown at the tool seam", async () => {
  const r = await (byName("asfdk_assess_text").execute as (id: string, p: unknown) => Promise<any>)("call-3", {
    text: "checking in",
  });
  const interaction = r.details.interaction as { content?: Record<string, unknown> };
  assert.equal(interaction.content?.channel, Channel.UNKNOWN);
  assert.equal(interaction.content?.trusted, false);
});
