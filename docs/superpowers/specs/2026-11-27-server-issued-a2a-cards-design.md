# Server-issued A2A agent cards and an MCP-only A2A hub in the Worker

| Field | Value |
|---|---|
| Status | Draft, waiting for Joshua's approval |
| Date | 2026-11-27 |
| Author | Claude Code (session `session_01UNjnjnzprwgjSgL2dJWxbP`) |
| Decision owner | Joshua W. Dorsey, Sr. |
| Related | THREAD-016 Workstream B, `docs/escalations/2026-11-21-kilo-mcp-a2a-ownership.md`, PR #39 review findings H7/H8 |

---

## 1. Why

Local coding agents (OpenCode, Kilo, Codex CLI, Claude CLI) were connected to **two separate MCP servers**: the ASFDK harness MCP server (`asfdk_*` tools) and the A2A hub, a separate MCP server (`asfdk-a2a-hub`, `src/discovery-hub.ts` on `127.0.0.1:3001`, which also serves REST). Each agent called `asfdk_a2a_agent_card` on the harness server, found the hub with `asfdk_discovery_hub`, and registered with `register_agent` on the hub server.

Because the hub was a separate server, it had no way to know who was calling. It trusted whatever identity the agent wrote: the card's `id`, a message's `from`, an inbox `callerId` (the Pi hub skill tells Pi to "keep your agent ID as `pi`").

Generative AIs (claude.ai, Cowork, Claude Code in the cloud) cannot install the harness. They reach it only through the MCP connector on the Cloudflare Worker, where there is no hub, so they cannot take part in A2A at all.

The local flow also never did what it was understood to do. Verified on 2026-11-27: `asfdk_a2a_agent_card` returns the same `asfdk-harness` card to every caller (tested as `opencode`, `kilo`, `codex` and `claude-code`). The card builder was written to support per-agent cards through `A2AAgentCardOptions`, but the harness pins those options to its own identity (§4), so no caller's identity ever reached it. Each agent must have rewritten that card's id, name and description itself before registering, and the local hub stores any card it is given. Nothing stopped two agents from using the same id, or one agent from claiming another's.

**Goal:** the harness issues each connected agent its own governance-bound identity card, and agents register that card in an A2A hub that lives in the Worker and is reachable only through the MCP server.

## 2. Decisions already made (Joshua, 2026-11-27)

1. The MCP server never exposes another AI's card: not the harness's, not the governance agent's. `asfdk_a2a_agent_card` returns the caller's own card.
2. Cards are **server-issued**. The server sets the identity; the agent cannot override it. (Option B of the conversation.)
3. The A2A hub moves into the Worker and is reachable **only through the MCP server**. No public `/a2a/*` routes. Unlike the local setup, the hub is not a separate MCP server: the same signed-in MCP request that identifies the caller also issues its card and reaches the hub, which is what lets the hub check identity instead of trusting it. This approves THREAD-016 Workstream B in this shape and answers three pending questions from earlier handoffs: hub location (Copilot, 2026-07-31), hub auth (Copilot, 2026-07-31) and agent identity model (Kilo, 2026-11-21).

## 3. Goals, non-goals, anti-goals

**Goals**
- Every caller of `asfdk_a2a_agent_card` gets a card whose identity comes from its connection.
- The card states the governance it operates under, without copying private TOI contents (PR #39 review H7).
- Agents register, discover each other and exchange messages through MCP tools on the Worker. Registration accepts only server-issued identities.
- The card tool behaves the same on the local stdio MCP server.

**Non-goals (this design)**
- A public A2A JSON-RPC endpoint or REST `/a2a/*` routes on the Worker.
- Changes to the governance agent (`/agents/*`, `AsfdkGovernanceAgent`) or its auth.
- Moving the local OpenCode/Kilo task-watch plugins onto the Worker hub. That is a later PR (§9).
- Changes to the local discovery hub (`src/discovery-hub.ts`); it stays as decided on 2026-11-21.
- The Pi extension's `/asfdk-a2a-card` command. Pi embeds the harness, so its card stays as is.
- Cryptographic signing of cards. Not needed while issuing and checking happen in the same Worker; revisit if cards leave it.

**Anti-goals (failure even if it works)**
- An agent registers under, overwrites, reads the inbox of, or sends as another agent's identity.
- A card or the hub exposes the user's email, name, private TOI preferences, IP address, tokens or file paths.
- The hub is reachable without the MCP server's sign-in.

## 4. Constraints found in the code and logs

- **The Worker MCP is stateless.** `src/server.ts` builds a fresh `McpServer` and transport per request, so the client's `initialize` info is not available during `tools/call`.
- **Per-request data a tool can read** (MCP SDK 1.30): `extra.requestInfo.headers`, and `extra.authInfo` when `server.ts` passes it to `transport.handleRequest(request, { authInfo })`. The OAuth props (`McpAuthProps`: `sub`, `email`, `name`, `authMethod`) are available to the `/mcp` handler.
- **Observed callers** (Workers logs, 2026-11-20 to 27): every request carries `x-anthropic-client` = `ClaudeCode`, `Cowork` or `ClaudeAI`, and `user-agent` = `Claude-User`.
- **Static-token callers** (`ASFDK_API_TOKEN`) all share `sub = "asfdk-api-token"`.
- **The local HTTP server** (`src/mcp-http-server.ts`) shares one server instance across clients, so its `initialize` info belongs to whichever client connected last.
- **The card builder already supports per-agent cards** (noted by Gemini). `createA2AAgentCard(context, options)` in `src/a2a.ts` takes `A2AAgentCardOptions` overrides: `agentId`, `agentName`, `description`, `url`, `version`, protocol and transport fields, modes, `streaming`, `pushNotifications`. These exist so the harness can generate a card for a specific sub-agent. But `harness.a2aAgentCard()` (`src/harness.ts:231-238`) pins `agentId: "asfdk-harness"` and `agentName: "ASFDK Harness"`, and it is the only caller, so neither the Pi tool nor the MCP tool has ever passed a caller's identity through. The options do **not** cover skills (always the harness's tool list), the governance block (always copies TOI `privacy`, `agency` and `toiAuthor`), `interopProtocols` or any issuance record.
- **Escalate-before-change:** the `asfdk.a2a_agent_card` entry in `ASFDK_TOOL_SKILLS` (`src/tools.ts`) changes. Approving this design approves that change. No other escalate-before-change file is touched (`governance/*`, `authority/verify.ts`, `policy.ts`, `.toi`, `.otoi`).
- **Deploy:** a new Durable Object class needs a new migration tag in `wrangler.jsonc`. Deploying stays Joshua's action.

## 5. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | Exact copy of the local flow: keep the template card, add the hub | Smallest change, but the server keeps handing out the harness's card and any agent can register any id | Rejected |
| B | **Server-issued cards**: identity from the connection, details from the agent, governance from TOI/OTOI | More code (identity plumbing, issuing), but identity cannot be faked and ids cannot collide | **Chosen by Joshua** |
| - | Connection-only identity | Unforgeable but thin, and every session of one client gets the same card with no way to tell them apart | Folded into B |
| - | Self-declared only | Rich, but any caller can claim to be anyone | Folded into B |

## 6. Design

### 6.1 Caller identity

A `resolveCaller(extra)` function returns a `CallerIdentity` for every tool call:

| Field | Worker `/mcp` | Local stdio | Local HTTP |
|---|---|---|---|
| `client` | `x-anthropic-client` header; else the first product token of `user-agent`; else `unknown` | `initialize` `clientInfo.name` | `user-agent` header (see §4) |
| `authMethod` | `cloudflare-access` or `static-token` | `local-stdio` | `local-http` |
| `principalRef` | first 8 hex chars of SHA-256 of the OAuth `sub` | `local` | `local` |

- `client` is normalised to a slug: lowercase, `[a-z0-9-]` only (`ClaudeCode` → `claudecode`).
- The OAuth `email` and `name` are never used in a card or the hub.
- `server.ts` passes the OAuth props to the transport as `authInfo` so tools can read them. *(The exact shape of that hand-off is the builder's call.)*

### 6.2 The issued card: `asfdk_a2a_agent_card`

**Build on the existing builder, don't replace it.** Issuing a card means calling `createA2AAgentCard(context, options)` with the caller's issued `agentId` and the agent's `agentName`, `description` and `url` passed through `A2AAgentCardOptions` (§4). A new harness method (for example `issueAgentCard(identity, declared)`) builds those options; `harness.a2aAgentCard()` stays pinned to `asfdk-harness` for the Pi extension. `A2AAgentCardOptions` gains only what it lacks:
- `skills?: A2ASkill[]`, which replaces the harness tool list when given;
- a governance mode that emits posture only (below) instead of copying TOI `privacy`, `agency` and `toiAuthor`;
- a switch to omit `interopProtocols`;
- an `issuance` record (below).

These changes stay in `src/a2a.ts` and `src/harness.ts`; `ASFDK_TOOL_SKILLS` itself is not restructured, only the `asfdk.a2a_agent_card` description changes.

**Inputs** (all optional, all self-declared): `name`, `description`, `skills` (A2A skill objects), `url`, `label`.

**Identity fields (server-set, cannot be overridden):**
- `id` = `{client}-{principalRef}`, or `{client}-{principalRef}-{label}` when a `label` is given. `label` is `[a-z0-9-]{1,24}` and lets one person run several agents of the same client as separate identities (for example two Claude Code sessions).
- `issuance` block: `{ issuer: "asfdk-harness", surface: "worker" | "local", issuedAt, identity: { client, authMethod, principalRef }, verified: ["id", "client", "authMethod", "principalRef"], declared: [fields the agent supplied] }`.

**Agent fields:** `name` (default from client: `Claude Code`, `Cowork`, `Claude.ai`, else the slug), `description` (default `"<name> connected to the ASFDK harness."`), `skills` (default empty; the harness's own tools are no longer listed), `url` (default empty; agents without an endpoint receive messages through the hub inbox).

**Governance (posture only):**
- Kept: the NLT governance extension; `authority` (final decision-maker and escalation rule, already public in the org governance contract); `guardrails`; OTOI `version` and `enforcement`; `otoi.registered` = whether `client` is listed in the OTOI charter's agents.
- Dropped compared to today: `toiAuthor`, the TOI `privacy` and `agency` objects (H7), `toiPath`/`otoiPath`, `interopProtocols`, and the harness skill list.

**Unchanged A2A fields:** `kind`, `protocolVersion` 0.3.0, `preferredTransport`, input and output modes, `discovery`, and `metadata.generatedAt` and redacted `diagnostics`.

The same caller with the same inputs always gets the same `id`. `harness.a2aAgentCard()` remains for the Pi extension; only the MCP tool changes.

### 6.3 The hub in the Worker

**Storage:** one SQLite-backed Durable Object class, `A2AHub`, with a single named instance holding the registry and the mailboxes. *(Builder's call; Kilo's handoff proposed separate `A2ARegistry` and `A2AMailbox` classes, but one class keeps reads consistent and is enough at this scale.)* `A2AHub` must not be reachable through `routeAgentRequest` or any other route. Only the MCP tool handlers call it.

**MCP tools on `/mcp`**, prefixed `asfdk_hub_`. The local hub server's names (`register_agent`, `get_inbox`, …) are not reused: their inputs differ (no card object, no `from` or `callerId`), and agents following the old instructions should get a clearly different tool rather than a familiar name that behaves differently.

| Tool | Behaviour |
|---|---|
| `asfdk_hub_register` | Takes the same inputs as the card tool, issues the card with the same code and stores it. It does **not** accept a card object. Re-registering updates the caller's own entry. |
| `asfdk_hub_deregister` | Removes the caller's own registration only. |
| `asfdk_hub_list_agents` | Lists registered cards (id, name, description, client, last seen). |
| `asfdk_hub_get_agent` | Returns one registered card by id. |
| `asfdk_hub_send_message` | `to`, `type` (`task`, `message`, `event`), `payload`, optional `replyTo`. `from` is set by the server to the caller's issued id. The target must be registered. |
| `asfdk_hub_inbox` | Returns the caller's own messages only and marks them delivered. |
| `asfdk_hub_status` | Counts only. |

**`asfdk_discovery_hub` on the Worker** returns `configured: true`, `transport: "mcp"` and the tool names above, instead of URLs. On the local server it is unchanged.

**Data:** `agents (id, card, client, principal_ref, registered_at, last_seen)` and `messages (id, from_id, to_id, type, payload, reply_to, created_at, delivered_at)`.

**Limits:** payload ≤ 32 KB; description ≤ 1,000 characters; ≤ 32 skills. *(Builder may tune these.)*

**Visibility:** every signed-in caller can list and read registrations; inboxes are per identity.

**Retention:** see open question Q1.

### 6.4 Local MCP server

- The card tool behaves the same, with identity from `clientInfo` (stdio) or headers (HTTP).
- Hub tools are registered only when a hub backend is available (the Worker binding). Locally, `asfdk_discovery_hub` keeps pointing at the local hub through `ASFDK_A2A_HUB_URL`.

## 7. Tests

- **Identity:** resolving the caller per surface, slug normalisation, id derivation is deterministic, `label` validation.
- **Card:** two clients get different ids; the same client gets the same id; `declared` lists exactly the supplied fields; fixtures with sentinel values prove that email, name, `toiAuthor`, TOI privacy/agency, paths and tokens never appear.
- **Hub:** `register` ignores any attempt to set `id`; `deregister`, `inbox` and `send_message` cannot act on or as another identity; unregistered targets are rejected; limits are enforced.
- **Existing tests:** `test/mcp-server.test.ts` assertions that the card id is `asfdk-harness` change to the new behaviour.
- **Gates:** `npm run check`, `npm run cf:check`, `npm run test:unit`, and an end-to-end run against `wrangler dev` before the deploy PR, as THREAD-017 did.

## 8. Records

- New thread THREAD-019 in `docs/active-threads.md`.
- A decision entry appended to `docs/escalations/2026-11-21-kilo-mcp-a2a-ownership.md` recording Workstream B's approval and shape.
- A registration and handoff in `docs/agent-log/`.

## 9. Delivery

1. **PR 1:** caller identity and the issued card (local and Worker), tests, records.
2. **PR 2:** `A2AHub` Durable Object, hub tools, `asfdk_discovery_hub` change, `wrangler.jsonc` migration. Joshua deploys.
3. **Later PR:** move the local OpenCode/Kilo plugins onto the Worker hub through MCP, so cloud and local agents share one hub, and give the Kilo plugin its own default id (today both plugins default to `opencode-asfdk-deploy`).

## 10. Open questions for Joshua

- **Q1. Retention.** Your TOI declares `retention: session-only`, but hub registrations and messages outlive a single session by design. The local hub keeps messages for 7 days (up to 1,000).
- **Q2. Message governance.** Cloud AIs have no harness of their own, so the hub is the only place their messages pass through governance. Should the hub run an ASFDK assessment on message text?

## 11. Calls made by the author (check these)

- One `A2AHub` Durable Object rather than two classes.
- Same client and same person = same identity by default; `label` separates sessions.
- Unsalted SHA-256 prefix of the Access `sub` as `principalRef` (the `sub` is a random ID, not personal data, and is never shown).
- `authority` (your name as final decision-maker) stays in the card because it is already public in the org governance contract; `toiAuthor` is dropped.
- Hub tool names prefixed `asfdk_hub_` rather than reusing the local hub server's names, because their inputs and identity rules differ.
- Pi extension and local hub unchanged.
