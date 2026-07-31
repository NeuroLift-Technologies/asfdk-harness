# AGENTS.md — asfdk-harness/src

> **You are inside a governed NLT repository.** Read mandatory docs before any work.

## Mandatory reading order

1. `../NLT-DEV-OTOI.md` — org-level coding agent contract (ORG-DEV-OTOI-1.0.3)
2. `../AGENTS.md` — repo gateway (commit format, guardrails, handoff protocol)
3. `../docs/active-threads.md` — current open work

Final authority: **Joshua W. Dorsey, Sr.** Escalate; do not guess.

---

## What /src is

The full governance middleware stack for `asfdk-harness` — all source that sits between
Pi (coding agent platform) and the model, enforcing Solidarity Framework / OTOI rules.

### Module map

| File / Dir | Role |
|---|---|
| `index.ts` | Runtime extension entrypoint (Pi = first supported runtime) — hooks, tools, slash commands |
| `harness.ts` | Core `AsfdkHarness` wrapper around `@neurolift-technologies/asfdk` |
| `tools.ts` | 9 Pi tool definitions + `ASFDK_TOOL_SKILLS` canonical mapping |
| `policy.ts` | Hard block list — destructive shell commands + sensitive path access |
| `protocols.ts` | Loads `.toi`/`.otoi`, builds `GovernanceProtocolContext` |
| `a2a.ts` | A2A Agent Card generation for peer-agent discovery |
| `cli.ts` | `asfdk-harness` binary — standalone one-shot runner |
| `mcp-server.ts` | `asfdk-harness-mcp` binary — MCP server |
| `server.ts` | Cloudflare Workers HTTP handler |
| `governance/` | **Live safety pipeline** — crisis (RRT Advocate), OTOI compliance, Sleepwalker continuity |
| `authority/` | Contract verification, soft-halt logic |

---

## Escalate before changing these

Do not modify autonomously. Open an escalation and wait for explicit approval:

- `governance/crisis.ts` — crisis thresholds and fail-safe defaults (live safety system)
- `governance/otoi.ts` — OTOI compliance system prompt and prompt-injection sanitization
- `governance/continuity.ts` — Sleepwalker KV key structure and TTL
- `authority/verify.ts` — contract verification and soft-halt trigger
- `policy.ts` — hard block list (removing entries weakens guardrails)
- `ASFDK_TOOL_SKILLS` in `tools.ts` — canonical interop mapping

Do not modify `../.toi` or `../.otoi` — those are the user's declared Terms of Interaction.

---

## Commit format (all work in this repo)

```text
[AGENT_NAME] type(scope): description
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `ci`

Feature branch → Pull Request only. Never push directly to `main`.

Governed by Solidarity Framework | HAIEF | ORG-DEV-OTOI-1.0.3
