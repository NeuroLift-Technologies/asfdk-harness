/**
 * Worker A2A hub (THREAD-020, design PR #43 §7 "Hub"), with the handoff
 * NLT-HND-2026-002 decisions: Composite Synthesis Gate at the hub (ADR-001 §3.3)
 * and the 24-hour retention baseline.
 */
import "./setup.ts";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { AsfdkHarness } from "../src/harness.ts";
import { createMcpServer, HUB_TOOL_NAMES } from "../src/mcp-server.ts";
import type { CallerIdentity } from "../src/a2a-identity.ts";
import {
  DENY_COMPOSITE_EGRESS,
  EMPTY_RELEASE_POLICY,
  evaluateCompositeEgress,
  parseReleasePolicy,
  type CardKey,
  type ReleasePolicy,
} from "../src/hub/csg.ts";
import { HubStore } from "../src/hub/store.ts";
import { HUB_LIMITS, HUB_RETENTION_MS, type HubBackend } from "../src/hub/types.ts";
import { cleanupSwpStorage } from "./setup.ts";
import { memorySql, sqliteAvailable } from "./helpers/sqlite.ts";

const skip = !sqliteAvailable;

const A: CardKey = { agentId: "claude-aaaaaa", agentName: "Claude Code" };
const B: CardKey = { agentId: "chatgpt-bbbbbb", agentName: "Codex" };
const C: CardKey = { agentId: "claude-aaaaaa", agentName: "Claude Cowork" };

function callerFor(card: CardKey, observedClient: string): CallerIdentity {
  return {
    agentId: card.agentId,
    platform: card.agentId.split("-")[0]!,
    authMethod: "cloudflare-access",
    observedClient,
    surface: "worker",
  };
}
const callerA = callerFor(A, "claude-code");
const callerB = callerFor(B, "codex");
const callerC = callerFor(C, "claude-cowork");

function release(...routes: Array<[CardKey | "*", CardKey | "*"]>): ReleasePolicy {
  const pattern = (card: CardKey | "*") => (card === "*" ? { agentId: "*" } : { agentId: card.agentId, agentName: card.agentName });
  return parseReleasePolicy(JSON.stringify({ version: 1, releases: routes.map(([from, to]) => ({ from: pattern(from), to: pattern(to) })) }));
}

class Clock {
  t = Date.UTC(2026, 10, 28, 12, 0, 0);
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

function hubWith(clock = new Clock()) {
  const store = new HubStore(memorySql(), { now: clock.now });
  for (const [card, caller] of [
    [A, callerA],
    [B, callerB],
    [C, callerC],
  ] as const) {
    assert.ok(store.register(caller, card.agentName).ok);
  }
  return { store, clock };
}

const pending = (store: HubStore) => (store.status(callerA, A.agentName, EMPTY_RELEASE_POLICY) as { ok: true; value: { pendingMessages: number } }).value.pendingMessages;

// ---------------------------------------------------------------------------
// The gate itself
// ---------------------------------------------------------------------------

test("parseReleasePolicy fails closed on anything but a well-formed v1 document", () => {
  assert.deepEqual(parseReleasePolicy(null), EMPTY_RELEASE_POLICY);
  assert.equal(parseReleasePolicy("{nope").configured, false);
  assert.equal(parseReleasePolicy(JSON.stringify({ version: 2, releases: [] })).configured, false);
  const partial = parseReleasePolicy(
    JSON.stringify({ version: 1, releases: [{ from: { agentId: "a" }, to: { agentId: "b" } }, { from: "x" }, null] }),
  );
  assert.equal(partial.configured, true);
  assert.equal(partial.rules.length, 1);
  assert.equal(partial.diagnostics.length, 2);
});

test("evaluateCompositeEgress: unknown_taint needs a release for every source", () => {
  const taint = (origin: CardKey) => ({ origin, noDerivedEgress: true });
  assert.equal(evaluateCompositeEgress({ sources: [], destination: B, policy: release(["*", "*"]) }).decision, DENY_COMPOSITE_EGRESS);
  assert.equal(evaluateCompositeEgress({ sources: [taint(A)], destination: B, policy: EMPTY_RELEASE_POLICY }).decision, DENY_COMPOSITE_EGRESS);
  assert.equal(evaluateCompositeEgress({ sources: [taint(A)], destination: B, policy: release([A, B]) }).decision, "RELEASE");
  assert.equal(evaluateCompositeEgress({ sources: [taint(A)], destination: A, policy: EMPTY_RELEASE_POLICY }).decision, "RELEASE", "own content back to its origin is private");
  assert.equal(evaluateCompositeEgress({ sources: [taint(A), taint(C)], destination: B, policy: release([A, B]) }).decision, DENY_COMPOSITE_EGRESS);
  assert.equal(evaluateCompositeEgress({ sources: [taint(A), taint(C)], destination: B, policy: release([A, B], [C, B]) }).decision, "RELEASE");
  const byAgentId = parseReleasePolicy(JSON.stringify({ version: 1, releases: [{ from: { agentId: A.agentId }, to: { agentId: "*" } }] }));
  assert.equal(evaluateCompositeEgress({ sources: [taint(A), taint(C)], destination: B, policy: byAgentId }).decision, "RELEASE", "agentId-only pattern covers every name");
});

// ---------------------------------------------------------------------------
// Store: identity, gate, delivery
// ---------------------------------------------------------------------------

test("hub: register lists the issued card; binding and registration are checked", { skip }, () => {
  const { store } = hubWith();
  const listed = store.listAgents(callerA, A.agentName);
  assert.ok(listed.ok);
  assert.deepEqual(listed.value.map((a) => `${a.id}/${a.name}`).sort(), [`${A.agentId}/${A.agentName}`, `${B.agentId}/${B.agentName}`, `${C.agentId}/${C.agentName}`].sort());

  const impostor = store.register(callerFor(A, "claude-cowork"), A.agentName);
  assert.ok(!impostor.ok && impostor.code === "BINDING_MISMATCH");
  const outsider = store.listAgents(callerFor({ agentId: "claude-zzzzzz", agentName: "X" }, "x"), "X");
  assert.ok(!outsider.ok && outsider.code === "NOT_REGISTERED", "the hub is visible only from inside it");
});

test("hub: unknown recipient is refused before the gate; no fallback", { skip }, () => {
  const { store } = hubWith();
  const sent = store.sendMessage(callerA, A.agentName, { to: { agentId: "opencode-asfdk-deploy", agentName: "x" }, type: "task", payload: "hi" }, release(["*", "*"]));
  assert.ok(!sent.ok && sent.code === "UNKNOWN_RECIPIENT");
  const status = store.status(callerA, A.agentName, EMPTY_RELEASE_POLICY);
  assert.ok(status.ok && status.value.csg.denied === 0);
});

test("hub: without a release the gate denies, sanitized, and stores nothing", { skip }, () => {
  const { store } = hubWith();
  const sent = store.sendMessage(callerA, A.agentName, { to: B, type: "message", payload: { text: "hello" } }, EMPTY_RELEASE_POLICY);
  assert.ok(!sent.ok);
  assert.equal(sent.code, "DENY_COMPOSITE_EGRESS");
  for (const leaked of [A.agentId, B.agentId, "unknown_taint"]) assert.ok(!sent.message.includes(leaked), "denial discloses no labels or identities");
  assert.equal(pending(store), 0);
  const inbox = store.inbox(callerB, B.agentName);
  assert.ok(inbox.ok && inbox.value.length === 0);
  const status = store.status(callerA, A.agentName, EMPTY_RELEASE_POLICY);
  assert.ok(status.ok && status.value.csg.denied === 1 && status.value.csg.delivered === 0);
});

test("hub: a released route delivers once, stamped unknown_taint, to the recipient only", { skip }, () => {
  const { store } = hubWith();
  const policy = release([A, B]);
  const sent = store.sendMessage(callerA, A.agentName, { to: B, type: "task", payload: { text: "review PR 43" } }, policy);
  assert.ok(sent.ok);

  const notMine = store.inbox(callerC, C.agentName);
  assert.ok(notMine.ok && notMine.value.length === 0, "C cannot read B's inbox");
  const asImpostor = store.inbox(callerFor(B, "chatgpt"), B.agentName);
  assert.ok(!asImpostor.ok && asImpostor.code === "BINDING_MISMATCH", "another client cannot read as B");

  const inbox = store.inbox(callerB, B.agentName);
  assert.ok(inbox.ok);
  assert.equal(inbox.value.length, 1);
  const [message] = inbox.value;
  assert.deepEqual(message!.from, A, "from is set by the server");
  assert.deepEqual(message!.payload, { text: "review PR 43" });
  assert.deepEqual(message!.provenance, { source: "unknown_taint", no_derived_egress: true, classifiedBy: "asfdk-a2a-hub" });
  assert.ok(!("sources" in message!), "contributor sources are not disclosed");

  const again = store.inbox(callerB, B.agentName);
  assert.ok(again.ok && again.value.length === 0, "delivered once");

  // Reply: B → A needs its own release.
  const reply = store.sendMessage(callerB, B.agentName, { to: A, type: "message", payload: "done", replyTo: sent.value.id }, policy);
  assert.ok(!reply.ok && reply.code === "DENY_COMPOSITE_EGRESS");
  const both = release([A, B], [B, A]);
  // B now holds A's content, and A is B's destination: A's own content returning to A is private.
  const allowed = store.sendMessage(callerB, B.agentName, { to: A, type: "message", payload: "done", replyTo: sent.value.id }, both);
  assert.ok(allowed.ok);
  const badReply = store.sendMessage(callerB, B.agentName, { to: A, type: "message", payload: "x", replyTo: "not-a-message-for-B" }, both);
  assert.ok(!badReply.ok && badReply.code === "UNKNOWN_REPLY");
});

test("hub: lineage — content B received from A cannot reach C without A's release", { skip }, () => {
  const { store } = hubWith();
  assert.ok(store.sendMessage(callerA, A.agentName, { to: B, type: "message", payload: "from A" }, release([A, B])).ok);
  assert.ok(store.inbox(callerB, B.agentName).ok);

  const onlyB = release([B, C]);
  const forwarded = store.sendMessage(callerB, B.agentName, { to: C, type: "message", payload: "derived" }, onlyB);
  assert.ok(!forwarded.ok && forwarded.code === "DENY_COMPOSITE_EGRESS", "A's content is in B's source set");

  const both = release([B, C], [A, C]);
  assert.ok(store.sendMessage(callerB, B.agentName, { to: C, type: "message", payload: "derived" }, both).ok);
});

test("hub: payload and inbox limits apply after the gate", { skip }, () => {
  const { store } = hubWith();
  const policy = release(["*", "*"]);
  const big = store.sendMessage(callerA, A.agentName, { to: B, type: "message", payload: "x".repeat(HUB_LIMITS.payloadBytes) }, policy);
  assert.ok(!big.ok && big.code === "PAYLOAD_TOO_LARGE");
  for (let i = 0; i < HUB_LIMITS.pendingPerInbox; i++) {
    assert.ok(store.sendMessage(callerA, A.agentName, { to: B, type: "event", payload: `n${i}` }, policy).ok);
  }
  const full = store.sendMessage(callerA, A.agentName, { to: B, type: "event", payload: "overflow" }, policy);
  assert.ok(!full.ok && full.code === "INBOX_FULL");
});

test("hub: deregister removes only the caller's registration and drops its waiting messages", { skip }, () => {
  const { store } = hubWith();
  assert.ok(store.sendMessage(callerA, A.agentName, { to: B, type: "message", payload: "x" }, release([A, B])).ok);
  const wrong = store.deregister(callerFor(B, "chatgpt"), B.agentName);
  assert.ok(!wrong.ok && wrong.code === "BINDING_MISMATCH");
  const left = store.deregister(callerB, B.agentName);
  assert.ok(left.ok);
  assert.deepEqual(left.value, { removed: true, droppedMessages: 1 });
  assert.equal(pending(store), 0);
  const listed = store.listAgents(callerA, A.agentName);
  assert.ok(listed.ok && !listed.value.some((a) => a.id === B.agentId));
});

// ---------------------------------------------------------------------------
// Retention: 24-hour baseline
// ---------------------------------------------------------------------------

test("retention: undelivered messages and lineage drop after 24 hours", { skip }, () => {
  const { store, clock } = hubWith();
  const policy = release(["*", "*"]);
  assert.ok(store.sendMessage(callerA, A.agentName, { to: B, type: "message", payload: "old" }, policy).ok);
  assert.ok(store.sendMessage(callerA, A.agentName, { to: C, type: "message", payload: "read" }, policy).ok);
  assert.ok(store.inbox(callerC, C.agentName).ok); // C now holds lineage from A
  assert.equal(store.nextExpiry(), clock.t + HUB_RETENTION_MS);

  clock.advance(HUB_RETENTION_MS - 1);
  assert.equal(pending(store), 1);
  // Keep everyone registered while the clock moves.
  for (const [card, caller] of [[A, callerA], [B, callerB], [C, callerC]] as const) store.register(caller, card.agentName);

  clock.advance(1);
  const purged = store.purgeExpired();
  assert.ok(purged.messages >= 2 && purged.lineage >= 1);
  assert.equal(pending(store), 0);
  const inbox = store.inbox(callerB, B.agentName);
  assert.ok(inbox.ok && inbox.value.length === 0, "expired messages are never returned");
  // C's lineage from A expired, so C → B needs only C's own release now.
  assert.ok(store.sendMessage(callerC, C.agentName, { to: B, type: "message", payload: "fresh" }, release([C, B])).ok);
});

test("retention: a registration drops after 24 hours without hub activity; any call renews it", { skip }, () => {
  const { store, clock } = hubWith();
  clock.advance(HUB_RETENTION_MS - 1000);
  assert.ok(store.listAgents(callerA, A.agentName).ok, "A renews by using the hub");
  clock.advance(2000);
  const listed = store.listAgents(callerA, A.agentName);
  assert.ok(listed.ok);
  assert.deepEqual(listed.value.map((a) => a.name), [A.agentName], "idle B and C dropped; A kept");
  const card = store.readCard(B.agentId, B.agentName);
  assert.ok(card, "the issued card itself remains; only the registration dropped");
});

// ---------------------------------------------------------------------------
// MCP tools
// ---------------------------------------------------------------------------

let harness: AsfdkHarness;
before(async () => {
  harness = new AsfdkHarness();
  await harness.start();
});
after(async () => {
  await harness.shutdown();
  cleanupSwpStorage();
});

/** A HubBackend over HubStore, the way A2AHub wraps it, with a fixed release policy. */
function storeBackend(store: HubStore, policy: () => ReleasePolicy): HubBackend {
  return {
    issueOrEditCard: async (c, n, ch) => store.issueOrEditCard(c, n, ch),
    register: async (c, n) => store.register(c, n),
    deregister: async (c, n) => store.deregister(c, n),
    listAgents: async (c, n) => store.listAgents(c, n),
    getAgent: async (c, n, t) => store.getAgent(c, n, t),
    sendMessage: async (c, n, i) => store.sendMessage(c, n, i, policy()),
    inbox: async (c, n, l) => store.inbox(c, n, l),
    status: async (c, n) => store.status(c, n, policy()),
  };
}

async function client(hub: HubBackend | undefined, agentId: string, headers: Record<string, string>): Promise<Client> {
  const server = createMcpServer(harness, undefined, { surface: "worker", cards: hub, hub });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const authInfo: AuthInfo = {
    token: "[redacted]",
    clientId: "",
    scopes: [],
    extra: { props: { sub: "s", authMethod: "cloudflare-access", agentId, agentPlatform: agentId.split("-")[0] } },
  };
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => send(message, { ...options, authInfo });
  await server.connect(serverTransport);
  const original = serverTransport.onmessage;
  serverTransport.onmessage = (message, extra) =>
    original?.(message, { ...extra, requestInfo: { headers } } as Parameters<NonNullable<typeof original>>[1]);
  const c = new Client({ name: "hub-test", version: "1.0.0" });
  await c.connect(clientTransport);
  return c;
}

const parse = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse((result.content as Array<{ text: string }>)[0]!.text);

test("MCP: hub tools exist only with a hub; discovery points at them", { skip }, async () => {
  const none = await client(undefined, A.agentId, { "x-anthropic-client": "ClaudeCode" });
  const noneTools = (await none.listTools()).tools.map((t) => t.name);
  assert.ok(!noneTools.some((name) => name.startsWith("asfdk_hub_")));
  await none.close();

  const hub = storeBackend(new HubStore(memorySql()), () => EMPTY_RELEASE_POLICY);
  const c = await client(hub, A.agentId, { "x-anthropic-client": "ClaudeCode" });
  const tools = (await c.listTools()).tools.map((t) => t.name);
  for (const name of HUB_TOOL_NAMES) assert.ok(tools.includes(name), `${name} listed`);
  const discovery = parse(await c.callTool({ name: "asfdk_discovery_hub", arguments: {} }));
  assert.deepEqual(discovery.tools, [...HUB_TOOL_NAMES]);
  assert.equal(discovery.transport, "mcp");
  assert.equal(discovery.url, undefined);
  await c.close();
});

test("MCP: register → list → send (denied, then released) → inbox, as each caller's own card", { skip }, async () => {
  let policy = EMPTY_RELEASE_POLICY;
  const hub = storeBackend(new HubStore(memorySql()), () => policy);
  const claude = await client(hub, A.agentId, { "x-anthropic-client": "ClaudeCode" });
  const codex = await client(hub, B.agentId, { "user-agent": "openai-mcp/1.0.0 (Codex)" });

  const registered = parse(await claude.callTool({ name: "asfdk_hub_register", arguments: {} }));
  assert.equal(registered.card.id, A.agentId);
  assert.equal(registered.card.name, "Claude Code");
  assert.ok(registered.card.issuance);
  assert.ok(!(await codex.callTool({ name: "asfdk_hub_register", arguments: {} })).isError);

  const cardObject = await claude.callTool({ name: "asfdk_hub_register", arguments: { card: { id: "forged" } } });
  assert.ok(cardObject.isError, "register accepts no card object");
  const forgedFrom = await claude.callTool({
    name: "asfdk_hub_send_message",
    arguments: { to: { id: B.agentId, name: "Codex" }, payload: "x", from: { id: B.agentId, name: "Codex" } },
  });
  assert.ok(forgedFrom.isError, "from is not an input");

  const agents = parse(await claude.callTool({ name: "asfdk_hub_list_agents", arguments: {} })).agents;
  assert.equal(agents.length, 2);

  const denied = await claude.callTool({
    name: "asfdk_hub_send_message",
    arguments: { to: { id: B.agentId, name: "Codex" }, type: "task", payload: { text: "hi" } },
  });
  assert.ok(denied.isError);
  assert.equal(parse(denied).error, "DENY_COMPOSITE_EGRESS");

  policy = release([A, B]);
  const sent = parse(
    await claude.callTool({
      name: "asfdk_hub_send_message",
      arguments: { to: { id: B.agentId, name: "Codex" }, type: "task", payload: { text: "hi" } },
    }),
  );
  assert.equal(sent.status, "queued");
  assert.deepEqual(sent.to, { id: B.agentId, name: "Codex" });

  const mine = parse(await claude.callTool({ name: "asfdk_hub_inbox", arguments: {} })).messages;
  assert.equal(mine.length, 0);
  const theirs = parse(await codex.callTool({ name: "asfdk_hub_inbox", arguments: {} })).messages;
  assert.equal(theirs.length, 1);
  assert.deepEqual(theirs[0].from, { id: A.agentId, name: "Claude Code" });
  assert.equal(theirs[0].provenance.no_derived_egress, true);

  const peer = parse(await codex.callTool({ name: "asfdk_hub_get_agent", arguments: { id: A.agentId, name: "Claude Code" } }));
  assert.equal(peer.id, A.agentId);
  assert.equal(peer.governance.privacy, undefined);

  const status = parse(await codex.callTool({ name: "asfdk_hub_status", arguments: {} }));
  assert.deepEqual(status.csg, { enforced: true, surface: "worker-a2a-hub", releasesConfigured: true, releaseRules: 1, delivered: 1, denied: 1 });
  assert.equal(status.notification.supported, false);
  assert.equal(status.retention.mailboxHours, 24);

  await claude.close();
  await codex.close();
});

test("hub: lineage follows the connection — a new agentName cannot launder received content (Codex P1)", { skip }, () => {
  const { store } = hubWith();
  const byId = (from: CardKey | "*", to: CardKey | "*") =>
    parseReleasePolicy(
      JSON.stringify({
        version: 1,
        releases: [[from, to]].map(([f, t]) => ({
          from: f === "*" ? { agentId: "*" } : { agentId: (f as CardKey).agentId },
          to: t === "*" ? { agentId: "*" } : { agentId: (t as CardKey).agentId },
        })),
      }),
    );
  const D: CardKey = { agentId: "gemini-dddddd", agentName: "Gemini" };
  const callerD = callerFor(D, "gemini");
  assert.ok(store.register(callerD, D.agentName).ok);

  // A → B released; B reads A's content.
  assert.ok(store.sendMessage(callerA, A.agentName, { to: B, type: "message", payload: "from A" }, byId(A, B)).ok);
  assert.ok(store.inbox(callerB, B.agentName).ok);

  // B's client registers a fresh name under the same agent ID and tries B → D.
  const alias: CardKey = { agentId: B.agentId, agentName: "Codex Alias" };
  assert.ok(store.register(callerB, alias.agentName).ok);
  const laundered = store.sendMessage(callerB, alias.agentName, { to: D, type: "message", payload: "A's content" }, byId(B, D));
  assert.ok(!laundered.ok && laundered.code === "DENY_COMPOSITE_EGRESS", "A's content is still in the connection's source set");

  // A changed observed-client header on the same connection does not reset it either.
  const spoofed = callerFor({ agentId: B.agentId, agentName: "Other" }, "spoofed-client");
  assert.ok(store.register(spoofed, "Other").ok);
  const viaHeader = store.sendMessage(spoofed, "Other", { to: D, type: "message", payload: "A's content" }, byId(B, D));
  assert.ok(!viaHeader.ok && viaHeader.code === "DENY_COMPOSITE_EGRESS");

  // With A → D released as well, it goes through.
  const both = parseReleasePolicy(
    JSON.stringify({ version: 1, releases: [{ from: { agentId: B.agentId }, to: { agentId: D.agentId } }, { from: { agentId: A.agentId }, to: { agentId: D.agentId } }] }),
  );
  assert.ok(store.sendMessage(callerB, alias.agentName, { to: D, type: "message", payload: "ok" }, both).ok);
});

test("hub: asfdk_hub_status renews the caller's registration (Codex P2)", { skip }, () => {
  const { store, clock } = hubWith();
  clock.advance(HUB_RETENTION_MS - 1000);
  assert.ok(store.status(callerB, B.agentName, EMPTY_RELEASE_POLICY).ok, "B only polls status");
  clock.advance(2000);
  const listed = store.listAgents(callerB, B.agentName);
  assert.ok(listed.ok, "B is still registered");
  assert.ok(listed.value.some((a) => a.id === B.agentId));
});
