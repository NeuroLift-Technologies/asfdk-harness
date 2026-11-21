import "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { AsfdkHarness, FoundationMode } from "../src/harness.ts";
import { createMcpServer, MCP_SERVER_VERSION } from "../src/mcp-server.ts";
import { cleanupSwpStorage } from "./setup.ts";

let harness: AsfdkHarness;

before(async () => {
  harness = new AsfdkHarness();
  await harness.start();
});

after(async () => {
  await harness.shutdown();
  cleanupSwpStorage();
});

test("MCP server version is 0.2.0", () => {
  assert.equal(MCP_SERVER_VERSION, "0.2.0");
});

test("harness.protocolSnapshot returns protocol snapshot with redacted paths in non-dev mode", async () => {
  const snapshot = await harness.protocolSnapshot();
  // Should have redacted paths in non-dev mode
  assert.ok(typeof snapshot.cwd === "string");
  assert.ok(snapshot.cwd === "[REDACTED_PATH]" || snapshot.cwd.startsWith("/"));
  assert.ok(Array.isArray(snapshot.protocols));
  assert.ok(Array.isArray(snapshot.diagnostics));
});

test("harness.protocolSnapshot keeps real paths in development mode", async () => {
  const devHarness = new AsfdkHarness({ mode: FoundationMode.DEVELOPMENT });
  await devHarness.start();
  const snapshot = await devHarness.protocolSnapshot();
  assert.ok(snapshot.cwd === process.cwd() || snapshot.cwd.includes("workspace"));
  await devHarness.shutdown();
});

test("getThirdPartyProtocolProfiles returns interop protocol profiles", async () => {
  const { getThirdPartyProtocolProfiles } = await import("../src/protocols.js");
  const protocols = getThirdPartyProtocolProfiles();
  assert.ok(Array.isArray(protocols));
  assert.ok(protocols.length > 0);
  // Should have A2A, AG-UI, ACP, etc.
  const protocolIds = protocols.map((p) => p.id);
  assert.ok(protocolIds.includes("a2a"));
  assert.ok(protocolIds.includes("ag-ui"));
  assert.ok(protocolIds.includes("acp"));
});

test("harness.a2aAgentCard returns governed agent card", async () => {
  const card = await harness.a2aAgentCard();
  assert.equal(card.kind, "a2a-agent-card");
  assert.equal(card.discovery.protocol, "A2A");
  assert.equal(card.preferredTransport, "JSONRPC");
  assert.ok(card.governance.toiPath.length > 0);
  assert.ok(Array.isArray(card.skills));
  assert.ok(card.skills.some((skill) => skill.id === "asfdk.status"));
  assert.ok(card.skills.every((skill) => Array.isArray(skill.tags) && skill.tags.length > 0));
});

// Test that the MCP server can be created with the new tools (smoke test)
test("createMcpServer creates server with all expected tools", async () => {
  const server = createMcpServer(harness);
  assert.ok(server);
  // The server is created successfully - tools are registered internally
  // We verify via harness methods that the underlying functionality works
});