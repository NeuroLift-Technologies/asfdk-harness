/**
 * Server-issued A2A cards (THREAD-020, design PR #43 §7 "Issuing at acceptance",
 * "Card" and "Lifecycle").
 */
import "./setup.ts";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { AsfdkHarness } from "../src/harness.ts";
import { createMcpServer } from "../src/mcp-server.ts";
import {
  AGENT_ID_PATTERN,
  defaultAgentName,
  formatAgentId,
  observedClientFromHeaders,
  observedClientFromUserAgent,
  platformFromClient,
  resolveLocalCaller,
  resolveWorkerCaller,
  type CallerIdentity,
} from "../src/a2a-identity.ts";
import { applyCardRequest, MemoryCardStore, type CardBackend } from "../src/a2a-cards.ts";
import { createIssuedA2AAgentCard } from "../src/a2a.ts";
import { HubStore } from "../src/hub/store.ts";
import { buildGrant } from "../src/oauth/grant.ts";
import { renderConsentPage } from "../src/oauth/consent-page.ts";
import { cleanupSwpStorage } from "./setup.ts";
import { memorySql, sqliteAvailable } from "./helpers/sqlite.ts";

// Sentinels that must never reach a card or the hub.
const SENTINEL_EMAIL = "sentinel-person@example.com";
const SENTINEL_NAME = "Sentinel Person Name";
const SENTINEL_SUB = "sentinel-sub-7c1e";
const SENTINEL_TOI_AUTHOR = "Sentinel TOI Author";
const SENTINEL_PRIVACY = "sentinel-privacy-value";
const SENTINEL_AGENCY = "sentinel-agency-value";

const toiContent = JSON.stringify({
  $toi: "1.0.0",
  identity: { author: SENTINEL_TOI_AUTHOR },
  privacy: { data_retention: SENTINEL_PRIVACY },
  agency: { task_initiation: SENTINEL_AGENCY },
});

let harness: AsfdkHarness;

before(async () => {
  harness = new AsfdkHarness({ toiContent });
  await harness.start();
});

after(async () => {
  await harness.shutdown();
  cleanupSwpStorage();
});

function caller(overrides: Partial<CallerIdentity> = {}): CallerIdentity {
  return {
    agentId: "claude-7f3a9c",
    platform: "claude",
    authMethod: "cloudflare-access",
    observedClient: "claude-code",
    surface: "worker",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

test("platformFromClient: CIMD host label, else registered name, else 'agent'", () => {
  assert.equal(platformFromClient({ clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata" }), "claude");
  assert.equal(platformFromClient({ clientId: "https://chatgpt.com/oauth/client.json" }), "chatgpt");
  assert.equal(platformFromClient({ clientId: "https://www.mcp.vscode.dev/x" }), "vscode");
  assert.equal(platformFromClient({ clientId: "3f2a-uuid", clientName: "Codex CLI" }), "codex-cli");
  assert.equal(platformFromClient({ clientId: "3f2a-uuid" }), "agent");
  assert.equal(platformFromClient({ clientId: "3f2a", clientName: "<script>" }), "script");
});

test("formatAgentId: {platform}-{6 hex}, matching the agent ID pattern", () => {
  const id = formatAgentId("claude");
  assert.match(id, /^claude-[0-9a-f]{6}$/);
  assert.ok(AGENT_ID_PATTERN.test(id));
  assert.equal(formatAgentId("chatgpt", "91c2aa"), "chatgpt-91c2aa");
});

test("observedClient: x-anthropic-client wins; user agents lose their versions", () => {
  assert.equal(observedClientFromHeaders({ "x-anthropic-client": "ClaudeCode", "user-agent": "Claude-User" }), "claude-code");
  assert.equal(observedClientFromHeaders(new Headers({ "X-Anthropic-Client": "Cowork" })), "claude-cowork");
  assert.equal(observedClientFromHeaders({ "x-anthropic-client": "ClaudeAI" }), "claude-ai");
  assert.equal(observedClientFromUserAgent("openai-mcp/1.0.0 (Codex)"), "codex");
  assert.equal(observedClientFromUserAgent("openai-mcp/1.0.0"), "chatgpt");
  assert.equal(observedClientFromUserAgent("codex-mcp-client/0.0.0"), "codex-mcp-client");
  assert.equal(observedClientFromUserAgent(""), "unknown");
  assert.equal(defaultAgentName("claude-code"), "Claude Code");
  assert.equal(defaultAgentName("codex"), "Codex");
  assert.equal(defaultAgentName("codex-mcp-client"), "Codex Mcp Client");
});

test("resolveWorkerCaller: agentId from grant props only; static token and old grants refused", () => {
  const ok = resolveWorkerCaller(
    { sub: SENTINEL_SUB, authMethod: "cloudflare-access", agentId: "claude-7f3a9c", agentPlatform: "claude" },
    { "x-anthropic-client": "ClaudeCode" },
  );
  assert.ok(ok.ok);
  assert.deepEqual(ok.caller, {
    agentId: "claude-7f3a9c",
    platform: "claude",
    authMethod: "cloudflare-access",
    observedClient: "claude-code",
    surface: "worker",
  });
  assert.ok(!JSON.stringify(ok).includes(SENTINEL_SUB), "sub never reaches the caller identity");

  const old = resolveWorkerCaller({ sub: "u", authMethod: "cloudflare-access" }, {});
  assert.ok(!old.ok && old.reason === "reconnect");
  const token = resolveWorkerCaller({ sub: "asfdk-api-token", authMethod: "static-token" }, {});
  assert.ok(!token.ok && token.reason === "static-token");
  const none = resolveWorkerCaller(undefined, {});
  assert.ok(!none.ok && none.reason === "unauthenticated");
});

test("resolveLocalCaller: local-{client}", () => {
  const local = resolveLocalCaller("OpenCode", {});
  assert.ok(local.ok);
  assert.equal(local.caller.agentId, "local-opencode");
  assert.equal(local.caller.surface, "local");
});

// ---------------------------------------------------------------------------
// Issuing at acceptance
// ---------------------------------------------------------------------------

test("buildGrant: agentId in the encrypted props and in the audit metadata", () => {
  const { props, metadata } = buildGrant(
    { sub: SENTINEL_SUB, email: SENTINEL_EMAIL, name: SENTINEL_NAME },
    { agentId: "claude-7f3a9c", platform: "claude" },
  );
  assert.equal(props.agentId, "claude-7f3a9c");
  assert.equal(props.agentPlatform, "claude");
  assert.equal(props.authMethod, "cloudflare-access");
  assert.equal(metadata.agentId, "claude-7f3a9c");
});

test("consent page tells the person an agent ID will be issued", () => {
  const html = renderConsentPage(
    { clientName: "Claude", clientDomain: "claude.ai", redirectHost: "claude.ai", redirectIsLoopback: false, scope: [] },
    "h",
    "ASFDK Harness",
    { agentIdPlatform: "claude" },
  );
  assert.ok(html.includes("issued its own agent ID, <code>claude-</code>"));
});

test("HubStore.reserveAgentId never issues the same ID twice", { skip: !sqliteAvailable }, () => {
  const store = new HubStore(memorySql());
  const ids = new Set<string>();
  for (let i = 0; i < 300; i++) ids.add(store.reserveAgentId("claude"));
  assert.equal(ids.size, 300);
  for (const id of ids) assert.match(id, /^claude-[0-9a-f]{6}$/);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test("applyCardRequest: issue once, edit bumps revision, unchanged edits are no-ops", () => {
  const issued = applyCardRequest(undefined, caller(), "Claude Code", {});
  assert.ok(issued.ok && issued.issued);
  assert.equal(issued.card.revision, 1);
  assert.deepEqual(issued.card.declared, []);

  const edited = applyCardRequest(issued.card, caller(), "Claude Code", { description: "Reviews PRs" });
  assert.ok(edited.ok && !edited.issued);
  assert.equal(edited.card.revision, 2);
  assert.deepEqual(edited.changed, ["description"]);
  assert.deepEqual(edited.card.declared, ["description"]);
  assert.equal(edited.card.agentId, "claude-7f3a9c");
  assert.equal(edited.card.issuedAt, issued.card.issuedAt);

  const same = applyCardRequest(edited.card, caller(), "Claude Code", { description: "Reviews PRs" });
  assert.ok(same.ok);
  assert.equal(same.card.revision, 2);
});

test("applyCardRequest: a different observed client on the same authorization is refused", () => {
  const issued = applyCardRequest(undefined, caller(), "Claude Code", {});
  assert.ok(issued.ok);
  const takeover = applyCardRequest(issued.card, caller({ observedClient: "claude-cowork" }), "Claude Code", {});
  assert.ok(!takeover.ok && takeover.code === "BINDING_MISMATCH");
});

test("applyCardRequest: url must be https on the Worker", () => {
  const bad = applyCardRequest(undefined, caller(), "Claude Code", { url: "http://example.com" });
  assert.ok(!bad.ok && bad.code === "INVALID_FIELD");
  const local = applyCardRequest(undefined, caller({ surface: "local" }), "x", { url: "http://localhost:4097" });
  assert.ok(local.ok);
  const creds = applyCardRequest(undefined, caller(), "x", { url: "https://user:pw@example.com" });
  assert.ok(!creds.ok);
});

test("HubStore: cards persist with a revision trail of field names only", { skip: !sqliteAvailable }, () => {
  const store = new HubStore(memorySql());
  store.issueOrEditCard(caller(), "Claude Code", {});
  store.issueOrEditCard(caller(), "Claude Code", { description: "secret-old-value", version: "1" });
  store.issueOrEditCard(caller(), "Claude Code", { description: "new" });
  const card = store.readCard("claude-7f3a9c", "Claude Code");
  assert.equal(card?.revision, 3);
  assert.equal(card?.fields.description, "new");
  const trail = store.cardRevisions("claude-7f3a9c", "Claude Code");
  assert.deepEqual(
    trail.map((r) => [r.revision, r.changedFields]),
    [
      [1, []],
      [2, ["description", "version"]],
      [3, ["description"]],
    ],
  );
  assert.ok(!JSON.stringify(trail).includes("secret-old-value"), "old values are not kept");
  const takeover = store.issueOrEditCard(caller({ observedClient: "claude-ai" }), "Claude Code", {});
  assert.ok(!takeover.ok);
});

// ---------------------------------------------------------------------------
// The card tool over MCP, through the real authInfo path
// ---------------------------------------------------------------------------

async function workerClient(
  props: Record<string, unknown> | undefined,
  headers: Record<string, string>,
  cards: CardBackend,
): Promise<Client> {
  const server = createMcpServer(harness, undefined, { surface: "worker", cards });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // Stand in for server.ts: the OAuth grant props ride in authInfo.extra.props.
  // InMemoryTransport carries authInfo but not HTTP headers, so the observed
  // client is supplied through a requestInfo shim on the server side.
  const authInfo: AuthInfo = { token: "[redacted]", clientId: "", scopes: [], extra: { props } };
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => send(message, { ...options, authInfo });
  const onmessage = () => serverTransport.onmessage;
  await server.connect(serverTransport);
  const original = onmessage();
  serverTransport.onmessage = (message, extra) =>
    original?.(message, { ...extra, requestInfo: { headers } } as Parameters<NonNullable<typeof original>>[1]);
  const client = new Client({ name: "worker-test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

const claudeProps = {
  sub: SENTINEL_SUB,
  email: SENTINEL_EMAIL,
  name: SENTINEL_NAME,
  authMethod: "cloudflare-access",
  agentId: "claude-7f3a9c",
  agentPlatform: "claude",
};

function parse(result: Awaited<ReturnType<Client["callTool"]>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
}

test("card tool: id is the authorization's agentId; name is the agent's; no private data", async () => {
  const cards = new MemoryCardStore();
  const client = await workerClient(claudeProps, { "x-anthropic-client": "ClaudeCode" }, cards);
  const result = await client.callTool({ name: "asfdk_a2a_agent_card", arguments: { agentName: "Claude Code" } });
  assert.ok(!result.isError);
  const card = parse(result);
  assert.equal(card.id, "claude-7f3a9c");
  assert.equal(card.name, "Claude Code");
  assert.equal(card.description, "Claude Code connected to the ASFDK harness.");
  assert.equal(card.url, "");
  assert.deepEqual(card.skills, []);
  assert.equal(card.interopProtocols, undefined);
  assert.equal(card.metadata.cwd, undefined);
  assert.equal(card.issuance.revision, 1);
  assert.equal(card.issuance.observedClient, "claude-code");
  assert.deepEqual(card.issuance.authorization, { agentId: "claude-7f3a9c", platform: "claude", authMethod: "cloudflare-access" });
  assert.equal(card.governance.toiPath, undefined);
  assert.equal(card.governance.privacy, undefined);
  assert.ok(card.governance.otoi === undefined || card.governance.otoi.registered === false);

  const text = JSON.stringify(card);
  for (const sentinel of [SENTINEL_EMAIL, SENTINEL_NAME, SENTINEL_SUB, SENTINEL_TOI_AUTHOR, SENTINEL_PRIVACY, SENTINEL_AGENCY, "[redacted]", process.cwd()]) {
    assert.ok(!text.includes(sentinel), `card must not contain ${sentinel}`);
  }
  await client.close();
});

test("card tool: omitted agentName comes from the client; edits bump revision; id cannot be set", async () => {
  const cards = new MemoryCardStore();
  const client = await workerClient(claudeProps, { "x-anthropic-client": "Cowork" }, cards);
  const first = parse(await client.callTool({ name: "asfdk_a2a_agent_card", arguments: {} }));
  assert.equal(first.name, "Claude Cowork");

  const edited = parse(
    await client.callTool({
      name: "asfdk_a2a_agent_card",
      arguments: {
        description: "Desktop agent",
        skills: [{ id: "summarize", name: "Summarize", description: "Summaries", tags: ["text"] }],
      },
    }),
  );
  assert.equal(edited.issuance.revision, 2);
  assert.deepEqual(edited.issuance.declared, ["description", "skills"]);
  assert.equal(edited.skills[0].id, "summarize");

  const forged = await client.callTool({ name: "asfdk_a2a_agent_card", arguments: { agentId: "chatgpt-000000" } });
  assert.ok(forged.isError, "agentId is not an input");
  const governance = await client.callTool({ name: "asfdk_a2a_agent_card", arguments: { governance: {} } });
  assert.ok(governance.isError, "governance is not an input");
  await client.close();
});

test("card tool: another client under the same authorization cannot take the card", async () => {
  const cards = new MemoryCardStore();
  const code = await workerClient(claudeProps, { "x-anthropic-client": "ClaudeCode" }, cards);
  await code.callTool({ name: "asfdk_a2a_agent_card", arguments: { agentName: "Claude Code" } });
  const cowork = await workerClient(claudeProps, { "x-anthropic-client": "Cowork" }, cards);
  const takeover = await cowork.callTool({ name: "asfdk_a2a_agent_card", arguments: { agentName: "Claude Code", description: "mine now" } });
  assert.ok(takeover.isError);
  assert.equal(parse(takeover).error, "BINDING_MISMATCH");
  await code.close();
  await cowork.close();
});

test("card tool: another authorization gets its own card under the same name", async () => {
  const cards = new MemoryCardStore();
  const claude = await workerClient(claudeProps, { "x-anthropic-client": "ClaudeCode" }, cards);
  await claude.callTool({ name: "asfdk_a2a_agent_card", arguments: { agentName: "Shared Name", description: "claude's" } });
  const chatgpt = await workerClient(
    { ...claudeProps, agentId: "chatgpt-91c2aa", agentPlatform: "chatgpt" },
    { "user-agent": "openai-mcp/1.0.0" },
    cards,
  );
  const other = parse(await chatgpt.callTool({ name: "asfdk_a2a_agent_card", arguments: { agentName: "Shared Name" } }));
  assert.equal(other.id, "chatgpt-91c2aa");
  assert.equal(other.description, "Shared Name connected to the ASFDK harness.");
  assert.equal(other.issuance.revision, 1);
  await claude.close();
  await chatgpt.close();
});

test("card tool: old grants are told to reconnect; the static token gets no card", async () => {
  const cards = new MemoryCardStore();
  const old = await workerClient({ sub: "u", authMethod: "cloudflare-access" }, {}, cards);
  const reconnect = await old.callTool({ name: "asfdk_a2a_agent_card", arguments: {} });
  assert.ok(reconnect.isError);
  assert.equal(parse(reconnect).error, "RECONNECT_REQUIRED");
  const token = await workerClient({ sub: "asfdk-api-token", authMethod: "static-token" }, {}, cards);
  const refused = await token.callTool({ name: "asfdk_a2a_agent_card", arguments: {} });
  assert.ok(refused.isError);
  assert.equal(parse(refused).error, "NO_AUTHORIZATION");
  await old.close();
  await token.close();
});

test("card tool: an edited charter file reaches an existing card on its next read", async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "asfdk-charter-"));
  const otoiPath = join(dir, ".otoi");
  const charter = JSON.parse(readFileSync(".otoi", "utf8"));
  writeFileSync(otoiPath, JSON.stringify(charter));
  const local = new AsfdkHarness({ otoiPath });
  await local.start();
  const server = createMcpServer(local);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "Kilo", version: "1.0.0" });
  await client.connect(clientTransport);
  try {
    const before = parse(await client.callTool({ name: "asfdk_a2a_agent_card", arguments: {} }));
    assert.equal(before.id, "local-kilo");
    assert.ok(Array.isArray(before.governance.guardrails) && before.governance.guardrails.length > 0, "charter guardrails present");
    assert.ok(!before.governance.guardrails.includes("Charter-reload sentinel guardrail"));

    charter["x-nlt-dev-otoi"].guardrails = [...charter["x-nlt-dev-otoi"].guardrails, "Charter-reload sentinel guardrail"];
    writeFileSync(otoiPath, JSON.stringify(charter));

    const after = parse(await client.callTool({ name: "asfdk_a2a_agent_card", arguments: {} }));
    assert.ok(after.governance.guardrails.includes("Charter-reload sentinel guardrail"), "the edit reaches the card");
    assert.equal(after.id, before.id);
    assert.equal(after.issuance.revision, 1, "governance changes do not count as agent edits");
  } finally {
    await client.close();
    await local.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("governedHubMessaging: false on local cards, true where the governed hub serves the card", async () => {
  const localServer = createMcpServer(harness);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await localServer.connect(st);
  const localClient = new Client({ name: "OpenCode", version: "1.0.0" });
  await localClient.connect(ct);
  const localCard = parse(await localClient.callTool({ name: "asfdk_a2a_agent_card", arguments: {} }));
  assert.equal(localCard.capabilities.extensions[0].params.governedHubMessaging, false);
  await localClient.close();

  const worker = await workerClient(claudeProps, { "x-anthropic-client": "ClaudeCode" }, new MemoryCardStore());
  const workerCard = parse(await worker.callTool({ name: "asfdk_a2a_agent_card", arguments: {} }));
  assert.equal(workerCard.capabilities.extensions[0].params.governedHubMessaging, false, "no hub backend → no claim");
  await worker.close();
});

test("issued card: otoi.registered reflects the OTOI charter's agents", async () => {
  const repo = new AsfdkHarness();
  const context = await repo.protocolContext();
  const issuance = (agentId: string) => ({
    issuer: "asfdk-harness" as const,
    surface: "local" as const,
    issuedAt: "2026-11-28T00:00:00.000Z",
    authorization: { agentId, platform: "local", authMethod: "local" },
    observedClient: "codex",
    verified: ["agentId"] as ["agentId"],
    observed: ["observedClient"] as ["observedClient"],
    declared: [],
    revision: 1,
    updatedAt: "2026-11-28T00:00:00.000Z",
  });
  const listed = createIssuedA2AAgentCard(context, { agentId: "codex", agentName: "Codex", issuance: issuance("codex") });
  const unlisted = createIssuedA2AAgentCard(context, { agentId: "claude-7f3a9c", agentName: "Claude Code", issuance: issuance("claude-7f3a9c") });
  if (context.effectivePolicy) {
    assert.equal(listed.governance.otoi?.registered, true);
    assert.equal(unlisted.governance.otoi?.registered, false);
  }
  assert.equal(unlisted.capabilities.extensions[0]?.params?.agentRuntimeGoverned, false, "no overclaim of runtime governance");
  assert.ok(!("toiAuthor" in unlisted.governance));
});

test("local HTTP: the agentId comes from the request's user agent, not the last clientInfo", async () => {
  const server = createMcpServer(harness);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const original = serverTransport.onmessage;
  serverTransport.onmessage = (message, extra) =>
    original?.(message, { ...extra, requestInfo: { headers: { "user-agent": "opencode/2.0.10" } } } as Parameters<NonNullable<typeof original>>[1]);
  const client = new Client({ name: "Some Other Client", version: "1.0.0" });
  await client.connect(clientTransport);
  const card = parse(await client.callTool({ name: "asfdk_a2a_agent_card", arguments: {} }));
  assert.equal(card.id, "local-opencode");
  assert.equal(card.name, "Opencode");
  await client.close();
});
