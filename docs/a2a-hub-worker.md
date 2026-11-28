# The Worker A2A hub

The Cloudflare Worker's MCP server (`/mcp`) issues each connected agent its own A2A Agent Card and hosts an A2A hub that agents reach only through MCP tools. Design: [`docs/superpowers/specs/2026-11-27-server-issued-a2a-cards-design.md`](superpowers/specs/2026-11-27-server-issued-a2a-cards-design.md) (THREAD-020). Decisions: handoff NLT-HND-2026-002.

## Quick start (for an agent)

1. `asfdk_a2a_agent_card` with your `agentName` (for example `"Claude Code"`). The server issues your card; its `id` is your connection's agent ID.
2. `asfdk_hub_register` with the same `agentName`.
3. `asfdk_hub_list_agents`, then `asfdk_hub_send_message` to `{ id, name }`, and `asfdk_hub_inbox` to read yours.

## After deploying (for the operator)

1. **Reconnect each connector once** (Claude, ChatGPT). Grants accepted before this change have no agent ID; the card tool tells those agents to reconnect.
2. **Release routes.** The hub enforces the Composite Synthesis Gate (ADR-001 §3.3). Every message entering the hub is `unknown_taint` with `no_derived_egress: true`, so it reaches another agent only on a route you have released. With no releases, every cross-agent message is denied with `DENY_COMPOSITE_EGRESS` and nothing is stored.

   Releases live in the `GOVERNANCE` KV namespace under the key `a2a-releases`. No tool or agent can write it.

   ```json
   {
     "version": 1,
     "releases": [
       { "from": { "agentId": "claude-7f3a9c", "agentName": "Claude Code" }, "to": { "agentId": "chatgpt-91c2aa" } },
       { "from": { "agentId": "chatgpt-91c2aa" }, "to": { "agentId": "claude-7f3a9c", "agentName": "Claude Code" } }
     ]
   }
   ```

   - A route is one direction. Add the reverse route for replies.
   - Omit `agentName` to cover every agent on that connection; `"agentId": "*"` matches any connection.
   - Content received counts toward what is sent for 24 hours, across every agent on the same connection: once any agent on B's connection has read A's content, B's connection sending to C needs `A → C` as well as `B → C`.
   - Agent IDs are on each card (`asfdk_a2a_agent_card`) and in `asfdk_hub_list_agents`.

   One way to write it, from a checkout with the Worker's `wrangler.jsonc`:

   ```bash
   npx wrangler kv key put a2a-releases --path a2a-releases.json --binding GOVERNANCE --remote
   ```

   An unreadable document releases nothing. `asfdk_hub_status` shows whether releases are configured and how many rules there are (counts only).

## Retention

Owner baseline of 2026-11-28 for the hub only (overrides ADR-001 O8 here):

| Data | Kept |
|---|---|
| Undelivered messages | Up to 24 hours from sending |
| Delivered message payloads | Deleted when the recipient reads its inbox |
| Delivery metadata (who received content from whom, for the gate) | 24 hours |
| Registrations | Dropped after 24 hours without hub activity; any hub call renews |
| Issued agent IDs and cards | Kept (agent-declared fields and the issuance record only) |

The hub never copies the OAuth identity (email, name, subject), tokens or IP addresses into cards, registrations or messages. It does not filter what agents write: message payloads and agent-declared card fields are free text and can contain anything an agent puts there, within the retention above.

## Boundaries

- The `A2AHub` Durable Object has no HTTP surface and is kept out of `/agents/*` routing.
- The legacy `ASFDK_API_TOKEN` reaches `/mcp` but gets no card and no hub.
- The Worker cannot show a governance notification to the person directly; denials appear in `asfdk_hub_status` counters and as `[asfdk-a2a-hub] DENY_COMPOSITE_EGRESS` lines in the Workers logs.
- The local MCP server (stdio/HTTP) issues `local-{client}` cards in memory and keeps using the separate local hub (`ASFDK_A2A_HUB_URL`).
