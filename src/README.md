# asfdk-harness/src

Source for the `asfdk-harness` governance middleware — the Solidarity Framework runtime/control
plane that sits between NeuroLift agent runtimes and model execution, enforcing Solidarity
Framework / OTOI rules.

## Three integration surfaces

| Surface | Entry point | How to run |
|---|---|---|
| Pi runtime extension (first supported) | `index.ts` | Loaded automatically by Pi when `asfdk-harness` is listed as a package extension |
| Standalone CLI | `cli.ts` | `npm run harness -- "your prompt"` or `asfdk-harness "your prompt"` |
| MCP server | `mcp-server.ts` | `npm run mcp` or `asfdk-harness-mcp` |

## Module overview

```
src/
├── index.ts          Runtime extension entrypoint (Pi = first supported) — hooks, tools, slash commands
├── harness.ts        Core AsfdkHarness class (wraps @neurolift-technologies/asfdk)
├── tools.ts          9 tool definitions (Pi runtime) + ASFDK_TOOL_SKILLS canonical mapping
├── policy.ts         Hard block list — destructive shell commands + sensitive paths
├── protocols.ts      TOI/OTOI file loading, GovernanceProtocolContext, interop catalog
├── a2a.ts            A2A Agent Card generation for peer-agent discovery
├── cli.ts            asfdk-harness binary (one-shot runner)
├── mcp-server.ts     asfdk-harness-mcp binary (MCP server)
├── server.ts         Cloudflare Workers HTTP handler
├── governance/       Live safety pipeline (see below)
│   ├── crisis.ts     RRT Advocate — LLM-based crisis detection (GREEN → BLACK)
│   ├── otoi.ts       OTOI compliance checker — reviews responses against user's TOI
│   ├── continuity.ts Sleepwalker — session context persistence (Cloudflare KV)
│   ├── index.ts      Pipeline orchestrator: assess → govern → save continuity
│   └── types.ts      Shared types (CrisisLevel, GovernanceEnv, etc.)
└── authority/
    └── verify.ts     Contract verification — checks .toi/.otoi validity, triggers soft-halt
```

## Data flow

```
User → Agent runtime (Pi, ...) → index.ts (hooks/tools)
                             ↓
                       AsfdkHarness (harness.ts)
                             ↓
                       protocols.ts (load .toi/.otoi) + policy.ts (block destructive calls)
                             ↓
                       governance pipeline: crisis → otoi compliance → continuity
                             ↓
                       @neurolift-technologies/asfdk foundation → model
```

## Governance

This repo is governed by **ORG-DEV-OTOI-1.0.2** (Solidarity Framework / HAIEF).

- Agent guidance: `AGENTS.md` (this directory) and `../AGENTS.md` (repo root)
- Claude Code guidance: `CLAUDE.md` (this directory) and `../CLAUDE.md` (repo root)
- Full contract: `../NLT-DEV-OTOI.md`
- Final authority: **Joshua W. Dorsey, Sr.**

Files under `governance/` and `authority/` are live safety systems — changes require
explicit escalation and approval before any PR is opened.
