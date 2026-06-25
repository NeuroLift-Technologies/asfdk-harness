import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DefaultResourceLoader,
  getAgentDir,
  createAgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import asfdkPiHarness from "../src/index.ts";
import { cleanupSwpStorage } from "./setup.ts";

const ASFDK_TOOL_NAMES = [
  "asfdk_a2a_agent_card",
  "asfdk_status",
  "asfdk_protocol_status",
  "asfdk_interop_protocols",
  "asfdk_assess_text",
  "asfdk_update_preferences",
];
const ASFDK_COMMAND_NAMES = ["asfdk-status", "asfdk-assess", "asfdk-protocols", "asfdk-interop", "asfdk-a2a-card"];
const ASFDK_HOOKS = ["session_start", "session_shutdown", "before_agent_start", "tool_call"];

function makeMockPi() {
  const tools: Array<{ name: string }> = [];
  const commands: Record<string, unknown> = {};
  const events: Record<string, (...args: any[]) => any> = {};
  const pi = {
    registerTool: (t: { name: string }) => tools.push(t),
    registerCommand: (name: string, def: unknown) => {
      commands[name] = def;
    },
    on: (event: string, handler: (...args: any[]) => any) => {
      events[event] = handler;
    },
  };
  return { pi, tools, commands, events };
}

// --- Self-contained: exercises the extension factory directly (no Pi session, no I/O) ---

test("factory registers all tools, commands, and lifecycle hooks", () => {
  const { pi, tools, commands, events } = makeMockPi();
  asfdkPiHarness(pi as never);

  assert.deepEqual([...tools.map((t) => t.name)].sort(), [...ASFDK_TOOL_NAMES].sort());
  for (const c of ASFDK_COMMAND_NAMES) assert.ok(c in commands, `command ${c} should be registered`);
  for (const e of ASFDK_HOOKS) assert.equal(typeof events[e], "function", `hook ${e} should be registered`);
});

test("tool_call hook gates destructive commands via the policy", async () => {
  const { pi, events } = makeMockPi();
  asfdkPiHarness(pi as never);

  const blocked = await events.tool_call({ type: "tool_call", toolCallId: "1", toolName: "bash", input: { command: "rm -rf /" } });
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /ASFDK/);

  const allowed = await events.tool_call({ type: "tool_call", toolCallId: "2", toolName: "bash", input: { command: "ls -la" } });
  assert.equal(allowed, undefined, "ordinary commands should pass through (undefined = no block)");
});

test("before_agent_start injects the governance system prompt and a hidden preflight message", async () => {
  const { pi, events } = makeMockPi();
  asfdkPiHarness(pi as never);
  try {
    const res = await events.before_agent_start({
      type: "before_agent_start",
      prompt: "hello there",
      systemPrompt: "BASE_PROMPT",
      systemPromptOptions: { cwd: process.cwd(), selectedTools: [] },
    });
    assert.ok(res?.systemPrompt.startsWith("BASE_PROMPT"), "must preserve the base system prompt");
    assert.match(res.systemPrompt, /ASFDK Solidarity Layer/, "must inject the Solidarity governance note");
    assert.equal(res.message.customType, "asfdk-preflight");
    assert.equal(res.message.display, false, "preflight context must be hidden from the user");
  } finally {
    cleanupSwpStorage();
  }
});

// --- Integration: loads through Pi's real resource loader the way Pi does in this repo.
// Requires this repo to be a registered Pi user package (it is, via ~/.pi/agent/settings.json). ---

test("Pi auto-discovers and loads the integrated extension with zero errors", async () => {
  const cwd = process.cwd();
  const sessionDir = mkdtempSync(join(tmpdir(), "asfdk-harness-test-"));
  try {
    const rl = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
    await rl.reload();
    const res = await createAgentSession({
      cwd,
      resourceLoader: rl,
      sessionManager: SessionManager.create(cwd, sessionDir),
    });
    try {
      assert.deepEqual(res.extensionsResult?.errors ?? [], [], "extension should load with no errors");
      const names = (res.session.agent?.state?.tools ?? []).map((t: { name: string }) => t.name);
      for (const n of ASFDK_TOOL_NAMES) assert.ok(names.includes(n), `tool ${n} should be registered live`);
    } finally {
      res.session.dispose();
    }
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
    cleanupSwpStorage();
  }
});
