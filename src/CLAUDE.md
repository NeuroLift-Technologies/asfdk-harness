# CLAUDE.md — asfdk-harness/src

> **You are inside the source layer of a governed NLT repository.**
> Root governance applies here. Read in order before touching any file:
> 1. `../NLT-DEV-OTOI.md` — org-level agent contract (ORG-DEV-OTOI-1.0.2)
> 2. `../CLAUDE.md` — repo context, commands, key paths
> 3. `../docs/active-threads.md` — current open work
>
> Final authority: **Joshua W. Dorsey, Sr.** Escalate; do not guess.

---

## What /src is

`/src` is the entire governance middleware stack for `asfdk-harness`. It sits between the
coding agent (Pi) and model execution, enforcing Solidarity Framework / OTOI rules.

Three integration surfaces are built here:
- **Pi extension** (`index.ts`) — hooks, tools, slash commands inside Pi
- **Standalone CLI** (`cli.ts`) — one-shot governance-wrapped prompt runner (`asfdk-harness`)
- **MCP server** (`mcp-server.ts`) — exposes ASFDK tools over Model Context Protocol

---

## Module map

| File | Role |
|---|---|
| `index.ts` | Pi extension entrypoint — registers tools, lifecycle hooks, slash commands |
| `harness.ts` | Core `AsfdkHarness` class — wraps `@neurolift-technologies/asfdk`, manages init/shutdown, protocol loading, A2A card generation |
| `tools.ts` | 9 Pi tool definitions + `ASFDK_TOOL_SKILLS` (canonical tool→skill mapping) |
| `policy.ts` | Hard block list — destructive shell commands and sensitive path access |
| `protocols.ts` | Loads `.toi`/`.otoi` files, builds `GovernanceProtocolContext`, catalogs third-party interop targets |
| `a2a.ts` | Converts governance context into A2A Agent Card for peer-agent discovery |
| `cli.ts` | `asfdk-harness` binary — standalone one-shot runner |
| `mcp-server.ts` | `asfdk-harness-mcp` binary — MCP server for external clients |
| `server.ts` | Cloudflare Workers HTTP handler — bearer-auth entry point for `AsfdkGovernanceAgent` |

### Subdirectories

| Dir | Role |
|---|---|
| `governance/` | **Live safety pipeline** — crisis detection (RRT Advocate), OTOI compliance, Sleepwalker session continuity, pipeline orchestration |
| `authority/` | Contract verification — checks `.toi`/`.otoi` presence, validity, signatures; can trigger soft-halt |

---

## Escalate before touching these

These files govern live safety systems or hard security boundaries. Do not change them
autonomously — open an escalation and wait for Joshua's explicit approval:

- **`governance/crisis.ts`** — RRT Advocate crisis thresholds and fail-safe defaults
- **`governance/otoi.ts`** — OTOI compliance system prompt and sanitization logic
- **`governance/continuity.ts`** — Sleepwalker session persistence (KV TTL, key structure)
- **`authority/verify.ts`** — governance contract verification and soft-halt logic
- **`policy.ts`** — the hard block list; removing entries weakens safety guardrails
- **`ASFDK_TOOL_SKILLS`** in `tools.ts` — canonical tool→A2A skill mapping; drift breaks interop

Also do not modify `../.toi` or `../.otoi` — these are the user's declared Terms of
Interaction, not source code.

---

## Safe to work on independently

Routine feature work, bug fixes, and type improvements on:
- `harness.ts`, `protocols.ts`, `a2a.ts`, `cli.ts`, `mcp-server.ts`, `server.ts`
- Adding or updating Pi tools in `tools.ts` (but escalate if changing `ASFDK_TOOL_SKILLS`)
- `index.ts` hook wiring (escalate if removing or reordering existing lifecycle hooks)

Always: feature branch → PR → no direct push to `main`.
