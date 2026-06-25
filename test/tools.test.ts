import "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { AsfdkHarness } from "../src/harness.ts";
import { createAsfdkTools } from "../src/tools.ts";
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
