# Server-issued A2A agent cards and an MCP-only A2A hub in the Worker

| Field | Value |
|---|---|
| Status | **Approved 2026-11-28** by Joshua W. Dorsey, Sr. (handoff NLT-HND-2026-002, §12); built on branch `claude/vigilant-bardeen-gbsbss` |
| Date | 2026-11-27 |
| Author | Claude Code (session `session_01UNjnjnzprwgjSgL2dJWxbP`) |
| Decision owner | Joshua W. Dorsey, Sr. |
| Related | THREAD-016 Workstream B, `docs/escalations/2026-11-21-kilo-mcp-a2a-ownership.md`, PR #39 review findings H7/H8 |

---

## 1. Why

Local coding agents (OpenCode, Kilo, Codex CLI, Claude CLI) were connected to **two separate MCP servers**: the ASFDK harness MCP server (`asfdk_*` tools) and the A2A hub, a separate MCP server (`asfdk-a2a-hub`, `src/discovery-hub.ts` on `127.0.0.1:3001`, which also serves REST). Each agent called `asfdk_a2a_agent_card` on the harness server, found the hub with `asfdk_discovery_hub`, and registered with `register_agent` on the hub server.

Because the hub was a separate server, it had no way to know who was calling. It trusted whatever identity the agent wrote: the card's `id`, a message's `from`, an inbox `callerId` (the Pi hub skill tells Pi to "keep your agent ID as `pi`").

Generative AIs (Claude AI, Claude Cowork, Claude Code in the cloud, ChatGPT, Codex) cannot install the harness. They reach it only through the MCP connector on the Cloudflare Worker, where there is no hub, so they cannot take part in A2A at all.

The local flow also never did what it was understood to do. Verified on 2026-11-27: `asfdk_a2a_agent_card` returns the same `asfdk-harness` card to every caller (tested as `opencode`, `kilo`, `codex` and `claude-code`). The card builder was written to support per-agent cards through `A2AAgentCardOptions`, but the harness pins those options to its own identity (§4), so no caller's identity ever reached it. Each agent must have rewritten that card's id, name and description itself before registering, and the local hub stores any card it is given. Nothing stopped two agents from using the same id, or one agent from claiming another's.

**Goal:** the harness issues each connected agent its own governance-bound identity card, and agents register that card in an A2A hub that lives in the Worker and is reachable only through the MCP server.

## 2. Decisions already made (Joshua, 2026-11-27)

1. The MCP server never exposes another AI's card: not the harness's, not the governance agent's. `asfdk_a2a_agent_card` returns the caller's own card.
2. Cards are **server-issued**. The agent cannot set or override its identity. (Option B of the conversation.)
3. The A2A hub moves into the Worker and is reachable **only through the MCP server**. No public `/a2a/*` routes. Unlike the local setup, the hub is not a separate MCP server: the same signed-in MCP request that identifies the caller also issues its card and reaches the hub, which is what lets the hub check identity instead of trusting it. This approves THREAD-016 Workstream B in this shape and answers three pending questions from earlier handoffs: hub location (Copilot, 2026-07-31), hub auth (Copilot, 2026-07-31) and agent identity model (Kilo, 2026-11-21).
4. The agent sets the card options itself: the tool's inputs mirror `A2AAgentCardOptions`.
5. The card is a **governed artifact issued once**. After issuance, the agent it was issued to can change the prepopulated fields. It **cannot change its `agentId`**, the governance block or the issuance record.
6. **The `agentId` comes from the MCP server authorization acceptance**: it is issued when the user accepts a connection on the consent page, one per authorized connection.
7. **The `agentName` tells apart the agents that share one authorization**, and the agent supplies it through the tool option. Asked for its card, Claude Code calls `asfdk_a2a_agent_card` with `agentName: "Claude Code"`; Claude Cowork and Claude AI do the same with their names.

## 3. Goals, non-goals, anti-goals

**Goals**
- Every authorized agent that calls `asfdk_a2a_agent_card` gets its own card: `agentId` from its authorization, `agentName` from its own option.
- The card states the governance it operates under, without copying private TOI contents (PR #39 review H7).
- Agents register, discover each other and exchange messages through MCP tools on the Worker. Registration accepts only server-issued cards.
- The card tool behaves the same on the local stdio MCP server, within the limits of having no authorization step there (§6.4).

**Non-goals (this design)**
- A public A2A JSON-RPC endpoint or REST `/a2a/*` routes on the Worker.
- Changes to the governance agent (`/agents/*`, `AsfdkGovernanceAgent`) or its auth.
- Moving the local OpenCode/Kilo task-watch plugins onto the Worker hub. That is a later PR (§9).
- Changes to the local discovery hub (`src/discovery-hub.ts`); it stays as decided on 2026-11-21.
- The Pi extension's `/asfdk-a2a-card` command. Pi embeds the harness, so its card stays as is.
- Cryptographic signing of cards. Not needed while issuing and checking happen in the same Worker; revisit if cards leave it.
- Fixing Codex CLI's rejected connection (§4). Separate follow-up.

**Anti-goals (failure even if it works)**
- An agent registers under, edits, reads the inbox of, or sends as another agent's card.
- A card or the hub exposes the user's email, name, private TOI preferences, IP address, tokens or file paths.
- The hub is reachable without the MCP server's sign-in.

## 4. Constraints found in the code, storage and logs

- **Authorizations today** (`OAUTH_KV`, 2026-11-27): two accepted connections. **Claude** (`https://claude.ai/oauth/mcp-oauth-client-metadata`, accepted 2026-11-26 22:36 UTC) and **ChatGPT** (`https://chatgpt.com/oauth/client.json`, accepted 2026-11-27 01:11 UTC). Both clients identify themselves with a Client ID Metadata Document URL. A `deploy-check` test client exists with no authorization.
- **Agents per authorization** (Workers logs, last 7 days, successful `/mcp` requests):
  - Claude: Claude Code (`x-anthropic-client: ClaudeCode`), Claude Cowork (`Cowork`), Claude AI (`ClaudeAI`), plus connector setup requests with no client header. All send `user-agent: Claude-User`.
  - ChatGPT: ChatGPT (`user-agent: openai-mcp/1.0.0`) and Codex (`openai-mcp/1.0.0 (Codex)`). OpenAI does not send the `mcp-method` header.
  - So one authorization covers several agents. Each request still says which agent it is, which the server records for the binding in §6.2.
- **Codex CLI is being rejected.** `codex-mcp-client/0.0.0` made 20 `/mcp` requests from 2026-11-26 23:13 to 2026-11-27 17:03 UTC, all `401`, starting about half an hour after OAuth went live.
- **Where the authorization is completed:** `handleCallback` in `src/oauth/access-handler.ts:144-157` builds `McpAuthProps` (`sub`, `email`, `name`, `authMethod`) and calls `completeAuthorization`. Those props are encrypted into the grant and delivered with every authenticated request. Grants accepted before this change have no `agentId`.
- **The Worker MCP is stateless.** `src/server.ts` builds a fresh `McpServer` and transport per request, so the client's `initialize` info is not available during `tools/call`.
- **Per-request data a tool can read** (MCP SDK 1.30): `extra.requestInfo.headers`, and `extra.authInfo` when `server.ts` passes the props to `transport.handleRequest(request, { authInfo })`.
- **Static-token callers** (`ASFDK_API_TOKEN`) never pass through the consent page, so they have no authorization to take an `agentId` from.
- **The local HTTP server** (`src/mcp-http-server.ts`) shares one server instance across clients, so its `initialize` info belongs to whichever client connected last.
- **The card builder already supports per-agent cards** (noted by Gemini). `createA2AAgentCard(context, options)` in `src/a2a.ts` takes `A2AAgentCardOptions` overrides: `agentId`, `agentName`, `description`, `url`, `version`, protocol and transport fields, modes, `streaming`, `pushNotifications`. These exist so the harness can generate a card for a specific sub-agent. But `harness.a2aAgentCard()` (`src/harness.ts:231-238`) pins `agentId: "asfdk-harness"` and `agentName: "ASFDK Harness"`, and it is the only caller. The options do **not** cover skills (always the harness's tool list), the governance block (always copies TOI `privacy`, `agency` and `toiAuthor`), `interopProtocols` or any issuance record.
- **Escalate-before-change:** the `asfdk.a2a_agent_card` entry in `ASFDK_TOOL_SKILLS` (`src/tools.ts`) changes. Approving this design approves that change. No other escalate-before-change file is touched (`governance/*`, `authority/verify.ts`, `policy.ts`, `.toi`, `.otoi`).
- **Deploy:** a new Durable Object class needs a new migration tag in `wrangler.jsonc`. Deploying stays Joshua's action.

## 5. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | Exact copy of the local flow: keep the template card, add the hub | Smallest change, but the server keeps handing out the harness's card and any agent can register any id | Rejected |
| B | **Server-issued cards**: `agentId` from the authorization, details from the agent, governance from TOI/OTOI | More code (consent-time issuing, card storage), but the id cannot be faked or collide | **Chosen by Joshua** |
| - | Identity rebuilt from request headers on every call | No consent-page change, but the id is derived rather than issued, and nothing ties it to the user's acceptance | Replaced by decision 6 |
| - | Self-declared only | Rich, but any caller can claim to be anyone | Folded into B (the agent declares its name and details, not its id) |

## 6. Design

### 6.1 Issuing the `agentId` at authorization acceptance

When the user accepts a connection, `handleCallback` issues the `agentId` before calling `completeAuthorization`:

- **Format:** `{platform}-{suffix}`, for example `claude-7f3a` or `chatgpt-91c2`.
  - `platform` comes from the client: the host of its Client ID Metadata Document URL (`claude.ai` → `claude`, `chatgpt.com` → `chatgpt`), or a slug of the registered client name for clients registered the other way.
  - `suffix` is random hex, long enough to be unique among the account's authorizations (the builder picks the length; 4 to 6 characters).
- **Stored** in the grant props as `agentId`, next to the existing `sub`, `email`, `name` and `authMethod`, so every request on that connection carries it. Also stored in the grant's plain metadata for audit.
- **Shown on the consent page:** "Connect Claude to ASFDK Harness MCP. This connection will be issued agent ID `claude-7f3a`." *(Builder's call on the exact wording.)*
- **Existing connections** (the Claude and ChatGPT authorizations above) were accepted before this change and have no `agentId`. They get one by reconnecting once after deploy. Until then the card tool tells the agent to reconnect.
- **No authorization, no card:** a static-token caller gets an error explaining that a card is issued only to a connection authorized through the consent page.

Per request, a `resolveCaller(extra)` function returns:

| Field | Source | Use |
|---|---|---|
| `agentId` | grant props (`extra.authInfo`) | the card's identity; never an input |
| `observedClient` | `x-anthropic-client` header, else `user-agent` (for example `ClaudeCode`, `Cowork`, `ClaudeAI`, `openai-mcp/1.0.0 (Codex)`) | recorded on issuance and checked on every later read or edit (§6.2) |
| `authMethod` | grant props | recorded in the issuance block |

The OAuth `email`, `name` and `sub` are never put in a card or the hub.

### 6.2 The issued card: `asfdk_a2a_agent_card`

**Build on the existing builder, don't replace it.** Issuing a card means calling `createA2AAgentCard(context, options)` with the issued `agentId` and the agent's options passed through `A2AAgentCardOptions` (§4). A new harness method (for example `issueAgentCard(caller, declared)`) builds those options; `harness.a2aAgentCard()` stays pinned to `asfdk-harness` for the Pi extension. `A2AAgentCardOptions` gains only what it lacks:
- `skills?: A2ASkill[]`, which replaces the harness tool list when given;
- a governance mode that emits posture only (below) instead of copying TOI `privacy`, `agency` and `toiAuthor`;
- a switch to omit `interopProtocols`;
- an `issuance` record (below).

These changes stay in `src/a2a.ts` and `src/harness.ts`; `ASFDK_TOOL_SKILLS` itself is not restructured, only the `asfdk.a2a_agent_card` description changes.

**Inputs: the agent invokes the options directly.** The tool's input schema (today an empty `z.object({})`) mirrors `A2AAgentCardOptions`, with the same field names.

| Tool input | Passed to the builder as | Rule |
|---|---|---|
| `agentName` | `agentName` | Names the agent, for example `"Claude Code"`. Together with the `agentId` it selects which card. ≤ 100 characters. If omitted, the server fills it in from the observed client (`ClaudeCode` → `Claude Code`, `Cowork` → `Claude Cowork`, `ClaudeAI` → `Claude AI`, `openai-mcp … (Codex)` → `Codex`, `openai-mcp` → `ChatGPT`). |
| `description` | `description` | ≤ 1,000 characters |
| `url` | `url` | `https://` only (or `http://localhost` on the local server) |
| `version` | `version` | the agent's own version string |
| `defaultInputModes`, `defaultOutputModes` | same | MIME types |
| `streaming`, `pushNotifications` | same | booleans |
| `skills` | `skills` (new option) | ≤ 32 A2A skill objects |

Not inputs, because the server owns them: `agentId` (from the authorization, decision 6), `protocolVersion` and `preferredTransport` (what the harness actually supports), and `includeSensitiveGovernanceTools` (no longer relevant once the harness skill list is dropped).

**Card identity:** the card's `id` is the `agentId`; its `name` is the `agentName`. A card is identified by the pair, so Claude Code, Claude Cowork and Claude AI under the one Claude authorization are three cards:

```
id: claude-7f3a   name: Claude Code
id: claude-7f3a   name: Claude Cowork
id: claude-7f3a   name: Claude AI
```

**Issuance block** (server-set): `{ issuer: "asfdk-harness", surface: "worker" | "local", issuedAt, authorization: { agentId, platform, authMethod }, observedClient, verified: ["agentId", "observedClient"], declared: [fields the agent has set], revision, updatedAt }`.

**Lifecycle: issue once, then the agent edits** (decisions 5 to 7)

1. **Issue.** The first call with a given `agentName` under an authorization issues that card: every field is prepopulated (the agent's options or the defaults below, the governance block, the issuance record), the server records the observed client, and stores the card. `revision` = 1.
2. **Edit.** Later calls with the same `agentName` return the stored card. Any other options passed in replace the current values, `revision` goes up by one, `updatedAt` is set, and `declared` lists every field the agent has set so far.
3. **Locked.**
   - The `agentId`, the governance block and the issuance record are never inputs, so they cannot be changed.
   - The `agentName` is how the card is selected, so it is never renamed. A different `agentName` selects, or issues, a different card. This is also how an agent gets cards for its own sub-agents (for example `"Claude Code reviewer"`).
   - **Binding:** a card can be read or edited through this tool only by a request on the same authorization whose observed client matches the one recorded at issuance. This stops Claude Cowork from passing `agentName: "Claude Code"` and taking over Claude Code's card.
4. **Register.** The hub lists the card's current revision (§6.3).

The governance block is regenerated from the current TOI/OTOI on every read, so a charter change reaches existing cards without the agent doing anything.

**Defaults for unset fields:** `description` `"<agentName> connected to the ASFDK harness."`; `skills` empty (the harness's own tools are no longer listed); `url` empty (agents without an endpoint receive messages through the hub inbox).

**Governance (posture only):**
- Kept: the NLT governance extension; `authority` (final decision-maker and escalation rule, already public in the org governance contract); `guardrails`; OTOI `version` and `enforcement`; `otoi.registered` = whether the agent is listed in the OTOI charter's agents.
- Dropped compared to today: `toiAuthor`, the TOI `privacy` and `agency` objects (H7), `toiPath`/`otoiPath`, `interopProtocols`, and the harness skill list.

**Unchanged A2A fields:** `kind`, `protocolVersion` 0.3.0, `preferredTransport`, input and output modes unless the agent sets them, `discovery`, and `metadata.generatedAt` and redacted `diagnostics`.

### 6.3 The hub in the Worker

**Storage:** one SQLite-backed Durable Object class, `A2AHub`, with a single named instance holding the issued cards, the registry and the mailboxes. Issued cards live here even before an agent registers, because the card tool needs them from its first call (§6.2). *(Builder's call; Kilo's handoff proposed separate `A2ARegistry` and `A2AMailbox` classes, but one class keeps reads consistent and is enough at this scale.)* `A2AHub` must not be reachable through `routeAgentRequest` or any other route. Only the MCP tool handlers call it.

**MCP tools on `/mcp`**, prefixed `asfdk_hub_`. The local hub server's names (`register_agent`, `get_inbox`, …) are not reused: their inputs differ (no card object, no `from` or `callerId`), and agents following the old instructions should get a clearly different tool rather than a familiar name that behaves differently. Every hub tool acts as the caller's card, selected by its `agentName` and checked by the binding in §6.2.

| Tool | Behaviour |
|---|---|
| `asfdk_hub_register` | Takes `agentName` and lists that issued card in the hub, issuing it with defaults first if it doesn't exist. It does **not** accept a card object. Card edits go through `asfdk_a2a_agent_card`; the hub always shows the current revision. |
| `asfdk_hub_deregister` | Removes the caller's own registration only. |
| `asfdk_hub_list_agents` | Lists registered cards (`id`, `name`, description, last seen). |
| `asfdk_hub_get_agent` | Returns one registered card by `id` + `name`. |
| `asfdk_hub_send_message` | `to` (`id` + `name`), `type` (`task`, `message`, `event`), `payload`, optional `replyTo`. `from` is set by the server to the caller's card. The target must be registered. |
| `asfdk_hub_inbox` | Returns the caller's own messages only and marks them delivered. |
| `asfdk_hub_status` | Counts only. |

**`asfdk_discovery_hub` on the Worker** returns `configured: true`, `transport: "mcp"` and the tool names above, instead of URLs. On the local server it is unchanged.

**Data:**
- `cards (agent_id, agent_name, observed_client, auth_method, agent_fields, revision, issued_at, updated_at, registered_at, last_seen)`, keyed by `(agent_id, agent_name)`. `registered_at` is empty until the agent registers.
- `card_revisions (agent_id, agent_name, revision, changed_fields, updated_at)`: an audit trail of which fields changed and when, not their old values.
- `messages (id, from_agent_id, from_agent_name, to_agent_id, to_agent_name, type, payload, reply_to, created_at, delivered_at)`.

**Limits:** payload ≤ 32 KB; description ≤ 1,000 characters; ≤ 32 skills. *(Builder may tune these.)*

**Visibility:** every signed-in caller can list and read registrations; inboxes belong to one card.

**Retention:** see open question Q1.

### 6.4 Local MCP server

- There is no consent page locally, so there is no authorization to issue an `agentId` from. The local server uses `local-{client}` as the `agentId`, where `client` is the slug of the `clientInfo.name` sent on connect (stdio) or of the `user-agent` (HTTP). `agentName` and the other options work as on the Worker.
- With no Worker storage locally, issued cards are kept in memory for the life of the local server process. *(Builder's call; a file under `~/.asfdk/` would also work.)*
- Hub tools are registered only when a hub backend is available (the Worker binding). Locally, `asfdk_discovery_hub` keeps pointing at the local hub through `ASFDK_A2A_HUB_URL`.

## 7. Tests

- **Issuing at acceptance:** completing an authorization stores an `agentId` in the grant props and metadata; the format matches `{platform}-{suffix}`; two authorizations never get the same id; the consent page shows it; a grant without an `agentId` gets the reconnect message; a static-token caller gets the no-card error.
- **Card:** `id` always equals the authorization's `agentId`; the same `agentName` returns the same card; omitted `agentName` is filled from the observed client; `declared` lists exactly the fields the agent set; fixtures with sentinel values prove that email, name, `sub`, `toiAuthor`, TOI privacy/agency, paths and tokens never appear.
- **Lifecycle:** an edit changes only agent fields and bumps `revision`; no input can change `agentId`, governance or issuance; a different `agentName` issues a separate card instead of renaming; another authorization cannot read or edit the card; under the same authorization, a request whose observed client differs from the one recorded is refused; a charter change shows up on the next read.
- **Hub:** `register` accepts no card object; `deregister`, `inbox` and `send_message` cannot act on or as another card; unregistered targets are rejected; limits are enforced.
- **Existing tests:** `test/mcp-server.test.ts` assertions that the card id is `asfdk-harness` change to the new behaviour, and `test/oauth-access.test.ts` covers the new props.
- **Gates:** `npm run check`, `npm run cf:check`, `npm run test:unit`, and an end-to-end run against `wrangler dev` with the stand-in OIDC provider before the deploy PR, as THREAD-017 did.

## 8. Records

- New thread THREAD-020 in `docs/active-threads.md` (numbered THREAD-019 until 2026-11-28; renumbered because `main`'s THREAD-019 is Codex's MCP skills thread, merged first in PR #44).
- A decision entry appended to `docs/escalations/2026-11-21-kilo-mcp-a2a-ownership.md` recording Workstream B's approval and shape.
- A registration and handoff in `docs/agent-log/`.

## 9. Delivery

1. **PR 1:** issuing the `agentId` at authorization acceptance (`src/oauth/*`, consent page), caller resolution, the issued card and its lifecycle (local and Worker), the `A2AHub` Durable Object with the `cards` tables, the `wrangler.jsonc` migration, tests, records. Joshua deploys, then reconnects the Claude and ChatGPT connectors once.
2. **PR 2:** the hub on the same Durable Object: registry and message tools, and the `asfdk_discovery_hub` change. Joshua deploys.
3. **Later PRs:** move the local OpenCode/Kilo plugins onto the Worker hub through MCP, so cloud and local agents share one hub, and give the Kilo plugin its own default id (today both plugins default to `opencode-asfdk-deploy`). Separately, fix Codex CLI's rejected connection (§4).

## 10. Open questions for Joshua

- **Q1. Retention.** Your TOI declares `retention: session-only`, but hub registrations and messages outlive a single session by design. The local hub keeps messages for 7 days (up to 1,000).
- **Q2. Message governance.** Cloud AIs have no harness of their own, so the hub is the only place their messages pass through governance. Should the hub run an ASFDK assessment on message text?

## 11. Calls made by the author (check these)

- `agentId` format `{platform}-{random hex}`, with the platform taken from the client's metadata URL host or registered name.
- The observed-client binding (§6.2), so an agent under the same authorization cannot take another's card by passing its name.
- Default `agentName` values filled in from the observed client when the agent doesn't pass one.
- Existing connections reconnect once instead of being migrated.
- Static-token callers get no card.
- Locally, `agentId` = `local-{client}`, and issued cards live in memory for the life of the server process.
- One `A2AHub` Durable Object rather than two classes.
- `authority` (your name as final decision-maker) stays in the card because it is already public in the org governance contract; `toiAuthor` is dropped.
- Hub tool names prefixed `asfdk_hub_` rather than reusing the local hub server's names, because their inputs and identity rules differ.
- One tool both issues and edits a card (first call issues, later calls with fields edit), rather than a separate update tool.
- The revision audit trail records which fields changed and when, not the old values.
- The governance block is regenerated on every read rather than frozen at issuance, so it always reflects the current charter.
- Pi extension and local hub unchanged.

## 12. Owner decisions of 2026-11-28 and how they were built

Joshua reviewed this proposal through Gemini 1.5 Pro and decided, as Managing Member, by executive override (handoff **NLT-HND-2026-002**, recorded 2026-11-28 09:53 EST):

| | Decision | ADR-001 effect | Built as |
|---|---|---|---|
| D1 | **Identity binding.** OAuth-driven identity approved: `agentId` from the OAuth connection; agents self-declare `agentName` and `skills` through the MCP tool. The local signed-charter requirement is waived for external cloud connections. | Amends §3.1 (charter authentication) for external cloud connections | §6.1 and §6.2 as written |
| D2 | **Hub retention (answers Q1).** PASSIVE mailbox baseline: hub registrations and inboxes may hold messages up to 24 hours, then auto-drop. Overrides the NONE immediate session-purge rule for the Worker A2A routing layer. | Amends O8 for the hub only | Messages and lineage expire 24 h after creation; registrations after 24 h without hub activity; payloads deleted on delivery; lazy purge on every call plus a Durable Object alarm |
| D3 | **Message governance (answers Q2).** The hub enforces the Composite Synthesis Gate on every message before it reaches another agent's inbox. Unlabeled inputs entering the hub are stamped `source: unknown_taint`, `no_derived_egress: true`. | Affirms §3.3 | `src/hub/csg.ts`, evaluated inside `A2AHub` before any write |

### 12.1 Calls the builder made while implementing (check these)

- **Release list (the `USER_DECIDES` path).** ADR §3.3 allows `no_derived_egress` content to leave only where it is explicitly releasable to the destination. OTOI has no release grammar yet (ADR §3.3 and O3, open), so the hub reads the human's releases from the `GOVERNANCE` KV key `a2a-releases`, which no tool or agent can write. With no releases, nothing is releasable and every cross-agent message is denied (fail closed). Format: `{ "version": 1, "releases": [ { "from": { "agentId", "agentName"? }, "to": { "agentId", "agentName"? } } ] }`; `agentId` may be `"*"`. Moving this into OTOI when its grammar exists is a follow-up.
- **Source sets.** A message's sources are its sender plus every origin whose content the hub delivered to **any card on the sender's connection** (agent ID) in the last 24 hours (trusted read observation). Lineage is held per agent ID rather than per card because the `agentName` is caller-chosen and the observed client is a header; either could otherwise be changed to shed lineage (Codex review on PR #47). Conservative over-taint: after any agent on a connection reads anything from X, that connection's messages need X's release to each destination for 24 hours. ADR §3.3 says granularity and over-taint need owner review.
- **Private delivery.** Content returning to the card it came from needs no release; every other destination does, including another card under the same `agentId`.
- **Evaluation order.** Caller identity and binding, a registered recipient (no fallback) and `replyTo` validity first; then the gate; then payload size and inbox limits. Denials return only `DENY_COMPOSITE_EGRESS` and a fixed message; no source labels or identities.
- **Direct governance notification** is unsupported on the Worker (no host UI). The hub reports `notification.supported: false` and writes a one-line operator record to the Workers logs; it is not described as a notification.
- **Consent page** shows the platform part only (`claude-…`): the ID is issued after Access sign-in, and reserving IDs before sign-in would let unauthenticated visitors fill the table.
- **Agent ID uniqueness** is global, not per account: IDs are reserved in the `A2AHub` `agent_ids` table, because the hub is shared.
- **Issuance record** says `verified: ["agentId"]` (from the encrypted grant) and `observed: ["observedClient"]` (from request headers the client sends) instead of the draft's `verified: ["agentId", "observedClient"]`, so the card does not overclaim. The observed client is normalized without versions (`ClaudeCode` → `claude-code`, `openai-mcp/… (Codex)` → `codex`) so client upgrades do not break the binding.
- **Governance extension** on issued cards states `identity: "server-issued"`, `governedHubMessaging: true`, `agentRuntimeGoverned: false`, per ADR §3.1 ("a Card shall not advertise governance compliance that the agent's dispatch path does not enforce").
- **Visibility.** Listing and reading registrations requires the caller's own card to be registered ("discoverable only inside the protected Hub"); `asfdk_hub_status` needs only an identity.
- **Charter freshness.** The governance block is built on every read and never stored. Locally the harness re-reads `.toi`/`.otoi` on each issuance. On the Worker it is built from the charter the harness loaded from `GOVERNANCE` KV (or the secrets) when the isolate started, so a KV charter update reaches cards when the Worker reloads, not on the next read. Refreshing the Worker's charter per request affects every tool, so it is a follow-up (CodeRabbit review on PR #47).
- **Cards and agent IDs persist**; D2's 24-hour rule covers registrations and mailboxes. Cards hold only agent-declared, non-sensitive fields and the issuance record.
- **`routeAgentRequest`** routes to every Durable Object binding by name, so `server.ts` hands it an env without `A2A_HUB`, and `A2AHub.fetch()` always answers 404.

### 12.2 Still open

- An ADR-001 revision recording D1 to D3 (canonical home `NeuroLift-Technologies/solidarity-framework`; this repo cannot write there). ADR OI-14 asks implementation PRs to cite the applicable ADR revision.
- ADR §3.1 per-agent key pairs and public keys on cards are not built; D1 approves OAuth identity in their place for external cloud connections.
- Where the release list should live long-term (OTOI grammar), and whether same-`agentId` delivery should be released by default.
