import "./setup.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { AsfdkHarness, FoundationMode } from "../src/harness.ts";
import { createMcpServer, MCP_SERVER_VERSION } from "../src/mcp-server.ts";
import { cleanupSwpStorage } from "./setup.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

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

// Test that sanitized card redacts paths in non-dev mode
test("harness.a2aAgentCardSanitized redacts paths in non-dev mode", async () => {
  const card = await harness.a2aAgentCardSanitized();
  assert.equal(card.governance.toiPath, "[REDACTED_PATH]");
  assert.equal(card.governance.otoiPath, "[REDACTED_PATH]");
  assert.equal(card.metadata.cwd, "[REDACTED_PATH]");
  assert.ok(card.metadata.diagnostics.every((d) => !d.includes(process.cwd())));
});

// Test that sanitized card keeps real paths in development mode
test("harness.a2aAgentCardSanitized keeps real paths in development mode", async () => {
  const devHarness = new AsfdkHarness({ mode: FoundationMode.DEVELOPMENT });
  await devHarness.start();
  const card = await devHarness.a2aAgentCardSanitized();
  assert.ok(card.governance.toiPath === process.cwd() || card.governance.toiPath.includes("workspace"));
  assert.ok(card.metadata.cwd === process.cwd() || card.metadata.cwd.includes("workspace"));
  await devHarness.shutdown();
});

// MCP integration test using in-memory transport
test("MCP server: initialize → tools/list → tools/call for new tools", async () => {
  const server = createMcpServer(harness);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  
  await server.connect(serverTransport);
  
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  
  // List tools (connect() automatically initializes)
  const toolsResult = await client.listTools();
  const toolNames = toolsResult.tools.map((t) => t.name);
  
  // Verify new tools are present
  assert.ok(toolNames.includes("asfdk_protocol_status"), "asfdk_protocol_status should be listed");
  assert.ok(toolNames.includes("asfdk_interop_protocols"), "asfdk_interop_protocols should be listed");
  assert.ok(toolNames.includes("asfdk_a2a_agent_card"), "asfdk_a2a_agent_card should be listed");
  
  // Call asfdk_protocol_status
  const protocolStatusResult = await client.callTool({ name: "asfdk_protocol_status", arguments: {} });
  assert.ok(protocolStatusResult.content.length > 0);
  const protocolStatusText = protocolStatusResult.content[0].text;
  const protocolStatusData = JSON.parse(protocolStatusText);
  assert.ok(protocolStatusData.cwd === "[REDACTED_PATH]" || protocolStatusData.cwd.startsWith("/"));
  assert.ok(Array.isArray(protocolStatusData.protocols));
  assert.ok(Array.isArray(protocolStatusData.diagnostics));
  
  // Call asfdk_interop_protocols
  const interopResult = await client.callTool({ name: "asfdk_interop_protocols", arguments: {} });
  assert.ok(interopResult.content.length > 0);
  const interopData = JSON.parse(interopResult.content[0].text);
  assert.ok(Array.isArray(interopData));
  assert.ok(interopData.length > 0);
  
  // Call asfdk_a2a_agent_card: the caller's own issued card, not the harness's (THREAD-019).
  const cardResult = await client.callTool({ name: "asfdk_a2a_agent_card", arguments: {} });
  assert.ok(cardResult.content.length > 0);
  const cardData = JSON.parse(cardResult.content[0].text);
  assert.equal(cardData.kind, "a2a-agent-card");
  assert.equal(cardData.id, "local-test-client");
  assert.equal(cardData.name, "Test Client");
  assert.notEqual(cardData.id, "asfdk-harness");
  assert.equal(cardData.issuance.surface, "local");
  // Posture only: no TOI paths, contents or working directory.
  assert.equal(cardData.governance.toiPath, undefined);
  assert.equal(cardData.governance.otoiPath, undefined);
  assert.equal(cardData.metadata.cwd, undefined);
  
  await client.close();
  await server.close();
});

// Test asfdk_discovery_hub returns configured: false when no hub URL
test("MCP server: asfdk_discovery_hub returns configured: false when no ASFDK_A2A_HUB_URL", async () => {
  const server = createMcpServer(harness);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  
  await server.connect(serverTransport);
  
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  
  const result = await client.callTool({ name: "asfdk_discovery_hub", arguments: {} });
  assert.ok(result.content.length > 0);
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.configured, false);
  assert.ok(data.description.includes("not configured"));
  
  await client.close();
  await server.close();
});

// Test asfdk_discovery_hub returns configured: true when hub URL set
test("MCP server: asfdk_discovery_hub returns configured: true when ASFDK_A2A_HUB_URL set", async () => {
  process.env.ASFDK_A2A_HUB_URL = "https://hub.example.com";
  // Need to create a new server instance to pick up the env var
  const server = createMcpServer(harness);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  
  await server.connect(serverTransport);
  
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  
  const result = await client.callTool({ name: "asfdk_discovery_hub", arguments: {} });
  assert.ok(result.content.length > 0);
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.configured, true);
  assert.equal(data.url, "https://hub.example.com");
  assert.equal(data.mcp, "https://hub.example.com/mcp");
  assert.equal(data.register, "https://hub.example.com/a2a/register");
  assert.equal(data.agents, "https://hub.example.com/a2a/agents");
  assert.equal(data.health, "https://hub.example.com/health");
  
  await client.close();
  await server.close();
  
  delete process.env.ASFDK_A2A_HUB_URL;
});