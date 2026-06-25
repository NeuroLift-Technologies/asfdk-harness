# Active Threads — NeuroLift-Technologies/asfdk-harness

> This file tracks active work threads. Agents must read this at session start and update it during and at the end of each session.

**Last updated:** 2026-06-25

---

## Active Threads

### THREAD-001 — Pi ASFDK harness bootstrap
| Field | Value |
|---|---|
| **Thread ID** | THREAD-001 |
| **Status** | 🟡 In Progress |
| **Started** | 2026-06-25 |
| **Owner** | Pi coding agent / Codex / opencode |
| **Branch** | `main` (local working tree; PR branch not yet created) |
| **Task** | Bootstrap `asfdk-harness` as a Pi package and SDK runner, then add NLT governance files from `.github-private`. |
| **Scope** | `src/`, `skills/`, `prompts/`, package metadata, governance stubs/templates, `.claude/`, docs agent log |
| **Blockers** | None currently. Avoid `.github/workflows/*` edits until GitHub token has `workflow` scope. |
| **Related PR** | TBD |
| **Notes** | `@neurolift-technologies/asfdk` and `@flue/cli` are installed. `npm run check` and `npm run build` passed before governance import. Added root `.toi` for Josh using `nlt-toi` source material and validated it with `@neurolift-technologies/toi`. Codex confirmed Pi is installed at `/home/joshd/.volta/bin/pi`, this repo is already listed in Pi user packages, fixed missing skill frontmatter, and verified Pi discovers the extension, `asfdk-harness` skill, and `asfdk-harness` prompt with no diagnostics. Codex then refreshed `.toi` from `nlt-toi/packages/toi/test/fixtures/valid/josh-personal.toi`, added `.otoi` to bind the harness agents to `.toi` plus `.github-private/NLT-DEV-OTOI.md` governance metadata, updated `nltotoi.json`, and validated JSON, TOI parsing, OTOI honoring, `npm run check`, and `npm run build`. Codex added local runtime protocol integration in `src/protocols.ts`, wired it into Pi preflight/status/tool/command surfaces, and validated TypeScript, build, Pi discovery, package dry-run, protocol resolution, and extension registration. Codex then corrected protocol scope to third-party interoperability: added A2A, AG-UI, ACP, OpenAPI/REST, NLIP/Open Floor watchlist, and MCP separate-owner boundary profiles; added `asfdk_interop_protocols` and `/asfdk-interop`; documented `docs/third-party-protocols.md`; and revalidated check/build/discovery/pack. Joshua clarified MCP is owned by another agent/thread, so Codex should not work on MCP implementation. **Vibe added MCP server support**: Created `src/mcp-server.ts` exposing ASFDK tools via Model Context Protocol, updated package.json with bin entry and scripts, added `@modelcontextprotocol/sdk` dependency, updated README with MCP documentation. **opencode (big-pickle) completed memory system exploration**: Read and documented Pi SessionManager (JSONL tree), ASFDK UnifiedStateManager (in-memory, persistence TODO), Sleepwalker ContinuityManager (.swp_storage JSON). Registration and handoff records written to `docs/agent-log/`. |

---

### THREAD-002 — MCP Server Integration
| Field | Value |
|---|---|
| **Thread ID** | THREAD-002 |
| **Status** | 🟡 In Progress |
| **Started** | 2026-06-25 |
| **Owner** | Vibe |
| **Branch** | `main` |
| **Task** | Add MCP (Model Context Protocol) server capabilities to ASFDK harness per user request |
| **Scope** | `src/mcp-server.ts`, package.json updates, README.md, documentation |
| **Blockers** | None. Previous docs stated MCP was out of scope, but user explicitly requested MCP focus. |
| **Related PR** | TBD |
| **Notes** | Created MCP server exposing: asfdk_status, asfdk_assess_text, asfdk_update_preferences, asfdk_health_check, asfdk_review_tool_call, asfdk_process_interaction. Server uses stdio transport. Updated package.json with bin entry `asfdk-harness-mcp` and scripts `mcp` and `dev:mcp`. Added `@modelcontextprotocol/sdk` as direct dependency. Updated README.md with MCP documentation. Need to verify TypeScript build and test MCP server functionality. |

---

### THREAD-003 — Third-party interoperability protocols
| Field | Value |
|---|---|
| **Thread ID** | THREAD-003 |
| **Status** | 🟡 In Progress |
| **Started** | 2026-06-25 |
| **Owner** | Codex / Joshua |
| **Branch** | `main` (local working tree; PR branch not yet created) |
| **Task** | Define third-party interoperability direction for ASFDK harness, centered on A2A and adjacent protocols. |
| **Scope** | `src/protocols.ts`, `src/tools.ts`, `src/index.ts`, `docs/third-party-protocols.md`, `docs/non-mcp-integration-protocols.md`, `README.md`, `skills/asfdk-harness/SKILL.md`, package metadata |
| **Blockers** | None for Codex protocol registry work. MCP implementation is owned by THREAD-002 / Vibe and should not be modified by Codex protocol work. |
| **Related PR** | TBD |
| **Notes** | Codex added third-party protocol profiles for A2A, AG-UI, ACP, OpenAPI/REST, NLIP/Open Floor watchlist, and MCP ownership boundary; exposed the registry through `asfdk_interop_protocols` and `/asfdk-interop`; documented target adapter responsibilities in `docs/third-party-protocols.md`; validated with `npm run check`, `npm run build`, registry smoke test, dist protocol snapshot, extension registration, Pi discovery, and `npm pack --dry-run`. Per Joshua clarification, Codex should not work on MCP because another agent owns THREAD-002. Next proposed Codex step is an A2A Agent Card generator, then an A2A HTTP adapter if approved. |

---

### THREAD-004 — Session log consolidation
| Field | Value |
|---|---|
| **Thread ID** | THREAD-004 |
| **Status** | 🟢 Complete |
| **Started** | 2026-06-25 |
| **Owner** | Codex |
| **Branch** | `main` (local working tree; PR branch not yet created) |
| **Task** | Consolidate Codex work logs and active-thread status after multiple agents touched the harness. |
| **Scope** | `docs/agent-log/`, `docs/active-threads.md` |
| **Blockers** | None. |
| **Related PR** | TBD |
| **Notes** | Codex added a rollup log summarizing all Codex work performed in this session and updated active threads without deleting other agents' entries. |

---

### THREAD-005 — Test hardening, asfdk→npm guard, and integrated review
| Field | Value |
|---|---|
| **Thread ID** | THREAD-005 |
| **Status** | 🟢 Complete (local; no PR per Joshua) |
| **Started** | 2026-06-25 |
| **Owner** | Claude Code |
| **Branch** | `main` (local working tree; local changes only) |
| **Task** | Verify the integrated Pi harness, lock in the asfdk→npm wiring, and harden via tests without colliding with the concurrent Codex / Vibe / opencode sessions. |
| **Scope** | `test/`, `.gitignore`, `package.json` (additive), `docs/agent-log/`, this file (additive THREAD-005 only) |
| **Blockers** | None. A functional `mcp-server.ts` test is deferred until THREAD-002's critical MCP bug is fixed (it would otherwise fail `npm test`). |
| **Related PR** | None (local only) |
| **Notes** | Confirmed Pi v0.80.2 loads the integrated extension with zero errors (5 ASFDK tools) and the ASFDK foundation runs (TOI/OTOI, Sleepwalker, RRT all active). Verified **and guarded** the asfdk npm wiring (asfdk@0.2.0 + 4 pillars resolve from registry.npmjs.org with integrity, not a local link) via `test/asfdk-wiring.test.ts`. Added a hermetic, zero-dependency test suite (`node:test` + `tsx`) — now **27 tests**, wired into `npm test` (= check + units), mutation-verified non-vacuous; gitignored the runtime `.swp_storage/`. Ran a read-only adversarial review of the four-agent merge: **21/21 findings confirmed**. Routed: **CRITICAL** — `src/mcp-server.ts` declares `outputSchema` but returns `{content, details}` with no `structuredContent`, so under `@modelcontextprotocol/sdk@1.29.0` **every MCP tool call fails output validation** (→ THREAD-002 / Vibe). MEDIUM — `protocols.ts readOptionalFile` can crash `before_agent_start` (→ THREAD-003 / Codex); `index.ts` governance is silently fail-open (→ Joshua). Escalated to Joshua: the `bash` sensitive-path policy bypass is a real safety hole (threshold change held pending his decision). Full detail: `docs/agent-log/handoffs/2026-06-25-claude-code-harness-hardening.json`. Did not modify other agents' threads or source. |

---

## Resolved Threads

*(None yet)*
