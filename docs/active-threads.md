# Active Threads — NeuroLift-Technologies/asfdk-harness

> This file tracks active work threads. Agents must read this at session start and update it during and at the end of each session.

**Last updated:** 2026-06-28T18:15:27Z

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
| **Notes** | `@neurolift-technologies/asfdk` and `@flue/cli` are installed. `npm run check` and `npm run build` passed before governance import. Added root `.toi` for Josh using `nlt-toi` source material and validated it with `@neurolift-technologies/toi`. Codex confirmed Pi is installed at `/home/joshd/.volta/bin/pi`, this repo is already listed in Pi user packages, fixed missing skill frontmatter, and verified Pi discovers the extension, `asfdk-harness` skill, and `asfdk-harness` prompt with no diagnostics. Codex then refreshed `.toi` from `nlt-toi/packages/toi/test/fixtures/valid/josh-personal.toi`, added `.otoi` to bind the harness agents to `.toi` plus `.github-private/NLT-DEV-OTOI.md` governance metadata, updated `nltotoi.json`, and validated JSON, TOI parsing, OTOI honoring, `npm run check`, and `npm run build`. Codex added local runtime protocol integration in `src/protocols.ts`, wired it into Pi preflight/status/tool/command surfaces, and validated TypeScript, build, Pi discovery, package dry-run, protocol resolution, and extension registration. Codex then corrected protocol scope to third-party interoperability: added A2A, AG-UI, ACP, OpenAPI/REST, NLIP/Open Floor watchlist, and MCP separate-owner boundary profiles; added `asfdk_interop_protocols` and `/asfdk-interop`; documented `docs/third-party-protocols.md`; and revalidated check/build/discovery/pack. Joshua clarified MCP is owned by another agent/thread, so Codex should not work on MCP implementation. **Vibe added MCP server support**: Created `src/mcp-server.ts` exposing ASFDK tools via Model Context Protocol, updated package.json with bin entry and scripts, added `@modelcontextprotocol/sdk` dependency, updated README with MCP documentation. **opencode (big-pickle) completed memory system exploration**: Read and documented Pi SessionManager (JSONL tree), ASFDK UnifiedStateManager (in-memory, persistence TODO), Sleepwalker ContinuityManager (.swp_storage JSON). Registration and handoff records written to `docs/agent-log/`. **opencode (big-pickle) fixed Think agent type errors**: Fixed agent.ts with correct Think API signatures (Session/TurnContext/TurnConfig/ChatResponseResult imports, parameters→inputSchema for ai v6, ctx.system not this.systemPrompt, result.message.parts not result.messages), fixed createWorkspaceTools import path, fixed createExecuteTool(this) one-liner, fixed AiTextGenerationModels→keyof AiModels in crisis.ts/otoi.ts, created .dev.vars template, updated DO class_name in wrangler.jsonc. `npm run cf:check` passes clean. Agent registration and handoff records written to `docs/agent-log/`. **opencode (big-pickle) completed Cloudflare binding setup**: Added GOVERNANCE KV binding (reuses SESSION namespace), added ASFDK_GOVERNANCE_MODE var, ran npx wrangler types, verified npm run cf:check passes clean. Handoff record with remaining Codex work written to `docs/agent-log/handoffs/2026-06-26-cloudflare-binding-completion.json`. |

---

### THREAD-002 — MCP Server Integration
| Field | Value |
|---|---|
| **Thread ID** | THREAD-002 |
| **Status** | 🟡 In Progress |
| **Started** | 2026-06-25T18:45:00Z |
| **Owner** | Vibe |
| **Branch** | `main` |
| **Task** | Add MCP (Model Context Protocol) server capabilities to ASFDK harness per user request |
| **Scope** | `src/mcp-server.ts`, package.json updates, README.md, documentation |
| **Blockers** | None. Previous docs stated MCP was out of scope, but user explicitly requested MCP focus. |
| **Related PR** | TBD |
| **Notes** | Created MCP server exposing: asfdk_status, asfdk_assess_text, asfdk_update_preferences, asfdk_health_check, asfdk_review_tool_call, asfdk_process_interaction. Server uses stdio transport. Updated package.json with bin entry `asfdk-harness-mcp` and scripts `mcp` and `dev:mcp`. Added `@modelcontextprotocol/sdk` and `zod` as direct dependencies. Updated README.md with MCP documentation. **FIXED CRITICAL BUG from THREAD-005**: Removed outputSchema from all tool registrations (was returning content instead of structuredContent, causing validation failures under @modelcontextprotocol/sdk@1.29.0). TypeScript check/build pass, server starts successfully. Updated agent registration and handoff records with ISO timestamps. |

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
| **Scope** | `src/protocols.ts`, `src/a2a.ts`, `src/harness.ts`, `src/tools.ts`, `src/index.ts`, `docs/third-party-protocols.md`, `docs/non-mcp-integration-protocols.md`, `README.md`, `skills/asfdk-harness/SKILL.md`, package metadata |
| **Blockers** | None for Codex protocol registry work. MCP implementation is owned by THREAD-002 / Vibe and should not be modified by Codex protocol work. |
| **Related PR** | TBD |
| **Notes** | Codex added third-party protocol profiles for A2A, AG-UI, ACP, OpenAPI/REST, NLIP/Open Floor watchlist, and MCP ownership boundary; exposed the registry through `asfdk_interop_protocols` and `/asfdk-interop`; added `src/a2a.ts` plus `asfdk_a2a_agent_card` and `/asfdk-a2a-card` to generate a TOI/OTOI-governed A2A Agent Card from the active snapshot; documented target adapter responsibilities in `docs/third-party-protocols.md`; validated the new A2A surfaces with `npm run test:unit` and a direct `a2aAgentCard()` smoke check. Per Joshua clarification, Codex should not work on MCP because another agent owns THREAD-002. Codex/OpenCode then added deterministic `src/authority/verify.ts` and Cloudflare `GOVERNANCE` binding support. Zed completed the remaining advisory relabel gap in `src/governance/otoi.ts`, updated response shape to `advisoryResponse` / `advisoryFlags` / `advisoryOnly`, updated Worker/pipeline consumers, added `test/governance-advisory.test.ts`, and verified `npm test` passes with 43 tests. Next proposed Codex step is a real A2A HTTP adapter, then any adjacent non-MCP protocol adapters if approved. |

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
| **Status** | 🟢 Merged to `main` (PR #1) |
| **Started** | 2026-06-25 |
| **Owner** | Claude Code |
| **Branch** | `main` (local working tree; local changes only) |
| **Task** | Verify the integrated Pi harness, lock in the asfdk→npm wiring, and harden via tests without colliding with the concurrent Codex / Vibe / opencode sessions. |
| **Scope** | `test/`, `.gitignore`, `package.json` (additive), `docs/agent-log/`, this file (additive THREAD-005 only) |
| **Blockers** | None. Vibe fixed the MCP `structuredContent` bug in-tree (uncommitted); a functional `mcp-server.ts` test can be added once that fix lands on `main`. |
| **Related PR** | #1 — merged to `main` (`822582b`) |
| **Notes** | Confirmed Pi v0.80.2 loads the integrated extension with zero errors (5 ASFDK tools) and the ASFDK foundation runs (TOI/OTOI, Sleepwalker, RRT all active). Verified **and guarded** the asfdk npm wiring (asfdk@0.2.0 + 4 pillars resolve from registry.npmjs.org with integrity, not a local link) via `test/asfdk-wiring.test.ts`. Added a hermetic, zero-dependency test suite (`node:test` + `tsx`) — now **27 tests**, wired into `npm test` (= check + units), mutation-verified non-vacuous; gitignored the runtime `.swp_storage/`. Ran a read-only adversarial review of the four-agent merge: **21/21 findings confirmed**. Routed: **CRITICAL** — `src/mcp-server.ts` declares `outputSchema` but returns `{content, details}` with no `structuredContent`, so under `@modelcontextprotocol/sdk@1.29.0` **every MCP tool call fails output validation** (→ THREAD-002 / Vibe). MEDIUM — `protocols.ts readOptionalFile` can crash `before_agent_start` (→ THREAD-003 / Codex); `index.ts` governance is silently fail-open (→ Joshua). Escalated to Joshua: the `bash` sensitive-path policy bypass is a real safety hole (threshold change held pending his decision). Full detail: `docs/agent-log/handoffs/2026-06-25-claude-code-harness-hardening.json`. Did not modify other agents' threads or source. **Continuation (2026-06-25T15:46:28-04:00):** PR #1 merged to `main`; brought my own agent-log docs into ISO 8601 timestamp compliance per the new standard; opened the canonical timestamp standard as `.github-private` PR #166. Merged `main` still ships the MCP bug (Vibe's fix is in-tree, uncommitted, pending a round-2 PR); also corrected a malformed `Last updated` timestamp. |

---

## Resolved Threads

### THREAD-009 — ASFDK provenance defense: channel classification (C5 harness wiring)
| Field | Value |
|---|---|
| **Thread ID** | THREAD-009 |
| **Status** | 🟢 Complete |
| **Started** | 2026-08-04 |
| **Owner** | OpenCode CTO Orchestrator (background lane) |
| **Branch** | `nlt/asfdk-harness-provenance-defense` (base `origin/main` @ `55c71e6`) |
| **Task** | Implement plan `asfdk-provenance-defense` C5 (tasks 9-11): seam-assign channel provenance at the harness control-plane boundary — typed boundaries replacing `any`, channel pass-through (absent → `unknown`), mode-string normalization/fail-loud (T16), D4-restricted tool schemas (MCP/Pi/HTTP seams reject `user_input`), `index.ts` system/user_input tags — plus mandatory tests/build (`npm run check` / `npm run build` / `npm test`). |
| **Scope** | `src/harness.ts`, `src/mcp-server.ts`, `src/index.ts`, `src/tools.ts`, `test/harness.test.ts`, `test/tools.test.ts`, `test/asfdk-wiring.test.ts`, this file (append) |
| **Overlap scan (per plan §Current evidence)** | THREAD-001 (bootstrap — `src/` broad), THREAD-002 (MCP server — `src/mcp-server.ts`), THREAD-003 (interop protocols — `src/harness.ts`, `src/tools.ts`, `src/index.ts`) all scope C5 files. CROSS-REFERENCE: this thread's C5 edits are additive (optional `channel` params, legacy mode aliases, D4 validation on the `asfdk_assess_text`/`asfdk_process_interaction` schemas) and do NOT change the MCP tool set, protocol/A2A surfaces, or governance behavior. MCP ownership (THREAD-002) and protocol registry (THREAD-003) remain with those threads. THREAD-007 (control-plane reframe) unaffected. |
| **Blockers** | None. Required `@neurolift-technologies/asfdk` 0.2.2 local tarball install (unpublished window, D8) — completed with step-12 sign-off. |
| **Related PR** | https://github.com/NeuroLift-Technologies/asfdk-harness/pull/20 |
| **Notes** | Completed plan tasks 9-16: 67/67 `npm test` green, `npm run check` + `npm run build` clean; `asfdk-wiring.test.ts` amended (file:-resolved asfdk allowed, version ≥ 0.2.2 asserted, dated TODO restore registry assertion on publish); D8 dependency bump ^0.2.2; installed 0.2.2 `--no-save` into harness node_modules (verified real dir, NOT symlink); post-restart control plane verified live (`foundation-ready` + `message-assessment channel=model_output`, log run 4520e8d3; `asfdk_status`/`asfdk_health_check` healthy — TOI/OTOI + Sleepwalker + RRT active). Escalate-list untouched: `governance/*`, `authority/verify.ts`, `policy.ts`, `ASFDK_TOOL_SKILLS`, `src/cli.ts`. Merge order: asfdk PR #24 first, then this PR. |

### THREAD-008 — PR #8 review fixes and conflict resolution
| Field | Value |
|---|---|
| **Thread ID** | THREAD-008 |
| **Status** | 🟢 Complete |
| **Started** | 2026-06-28 |
| **Owner** | Codex |
| **Branch** | `codex/fix-governance-tool-gating` |
| **Task** | Address PR #8 review comments, resolve the merge conflict with `origin/main`, and keep checks green. |
| **Scope** | `src/server.ts`, `src/mcp-http-server.ts`, `src/tools.ts`, `src/protocols.ts`, `src/harness.ts`, focused tests, merge-conflict resolution |
| **Blockers** | None. |
| **Related PR** | #8 |
| **Notes** | Resolved merge conflicts against `origin/main`; moved Worker auth before `/mcp`; memoized MCP transports in Node and Worker entrypoints; standardized `asfdk_authority_chain`; restored OTOI-first resolution for `.toi.default`; made path redaction preserve HTTP(S) URLs; made Pi extension-load test self-contained; fixed CodeQL test assertions. Local `npm test` and `npm run build` passed before final docs-only bookkeeping. Remote PR checks passed on commit `3757f5c`; final bookkeeping pushed separately. |

### THREAD-007 — Architecture reframe: ASFDK Harness as control plane, Pi as first runtime
| Field | Value |
|---|---|
| **Thread ID** | THREAD-007 |
| **Status** | 🟡 In Progress |
| **Started** | 2026-06-28 |
| **Owner** | opencode |
| **Branch** | `codex/fix-governance-tool-gating` |
| **Task** | Reframe ASFDK Harness from "Pi package and SDK runner" to "Solidarity Framework runtime/control plane governing agent sessions, A2A delegation, MCP/tool surfaces, TOI/OTOI resolution, preflight checks, receipts, and escalation across NeuroLift agent runtimes. Pi is the first supported cofounder-agent runtime, not the boundary." |
| **Scope** | `README.md`, `CLAUDE.md`, `AGENTS.md`, `package.json`, `src/harness.ts`, `src/cli.ts`, `src/AGENTS.md`, `src/CLAUDE.md`, `src/README.md`, `skills/asfdk-harness/SKILL.md`, `.otoi`, `nltotoi.json` |
| **Blockers** | None. |
| **Related PR** | TBD from `codex/fix-governance-tool-gating` |
| **Notes** | Updated 11 files to depi-ify the framing and reposition the harness as a runtime-agnostic control plane. Changed `harness.ts` defaults from `pi-user`/`PI_SESSION_ID` to `asfdk-user`/`ASFDK_SESSION_ID`. Updated `.otoi` agent id from `pi-asfdk-harness` to `asfdk-harness` with expanded role. All 45 tests pass, `tsc` and `cf:check` clean. |

---

### THREAD-006 — Zed repo walkthrough
| Field | Value |
|---|---|
| **Thread ID** | THREAD-006 |
| **Status** | 🟢 Complete |
| **Started** | 2026-06-25 |
| **Owner** | Zed GPT-5.5 |
| **Branch** | `round-2-consolidation` |
| **Task** | Walk through repository structure, governance context, implementation surfaces, tests, and current validation state. |
| **Scope** | Read-only inspection of repo files plus required agent registration/handoff records. |
| **Blockers** | None. |
| **Related PR** | TBD |
| **Notes** | Reviewed required governance docs, README, package metadata, Pi extension, ASFDK harness wrapper, tools, policy checks, TOI/OTOI protocol loader, A2A card generation, MCP server, Workers/Agents SDK entrypoint, governance helper modules, docs, skills, and test suite. Ran `npm test`; TypeScript check, Workers check, and 29 unit tests passed. |
