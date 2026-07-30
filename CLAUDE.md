# CLAUDE.md — asfdk-harness

<!-- NLT Governance Preamble -->
> You are working in a NeuroLift Technologies repository.
>
> **Mandatory reading (in order):**
> 1. Org-level governance: `NLT-DEV-OTOI.md`
>    Private canonical source: https://github.com/NeuroLift-Technologies/.github-private/blob/main/NLT-DEV-OTOI.md
>    Public mirror (if private link returns 404):
>    https://github.com/NeuroLift-Technologies/.github/blob/main/governance/NLT-DEV-OTOI.md
> 2. Internal gateway: `AGENTS.md`
> 3. Active threads: `docs/active-threads.md`
>
> **Non-negotiable:** Joshua W. Dorsey, Sr. is final authority on all architectural,
> deployment, UX, and strategic decisions. Escalate. Do not guess.
>
> **Governed by:** Solidarity Framework | HAIEF | https://elevaitionfoundation.org
> **OTOI Version:** ORG-DEV-OTOI-1.0.3

---

## Repository purpose

`asfdk-harness` is the Solidarity Framework runtime / control plane for governing agent sessions, A2A delegation, MCP/tool surfaces, TOI/OTOI resolution, preflight checks, receipts, and escalation across NeuroLift agent runtimes.

It currently surfaces through three integration points:

1. A Pi cofounder-agent extension (`src/index.ts`) — Pi is the first supported runtime.
2. A standalone CLI one-shot runner (`src/cli.ts`).
3. An MCP server (`src/mcp-server.ts`) for MCP-compatible clients.

## Development commands

```bash
npm install
npm run check
npm run build
npm run harness -- "What files are in this repo?"
```

## Key paths

| Path | Purpose |
|---|---|
| `src/index.ts` | Runtime extension entrypoint (Pi = first supported runtime) |
| `src/harness.ts` | Core ASFDK control plane wrapper |
| `src/tools.ts` | Tool definitions exposed by the harness |
| `src/policy.ts` | Local tool-call policy checks |
| `src/cli.ts` | Standalone CLI one-shot runner |
| `skills/asfdk-harness/SKILL.md` | Pi skill for ASFDK harness behavior |
| `prompts/asfdk-harness.md` | Pi prompt template |
| `.claude/` | Canonical Claude Code governance template copied from `.github-private` |

## Governance notes

- Do not edit `NLT-DEV-OTOI.md` without Joshua's explicit approval and the formal amendment process.
- `.claude/` is copied from `.github-private`; upstream changes may overwrite downstream copies.
- Avoid touching `.github/workflows/*` unless the local GitHub token has `workflow` scope.
