# Codex Session Rollup — 2026-06-25

## Scope

Repository: `NeuroLift-Technologies/asfdk-harness`

Working tree: `main` local working tree, mostly untracked. Existing user/agent changes were preserved.

This rollup consolidates Codex work from the current session. It does not claim work done by Pi, Vibe, or opencode, except where noted as active-thread context.

## Codex Work Completed

### Harness discovery and Pi validation

- Inspected `Desktop/nlt-repos/asfdk-harness`.
- Read governance files: `NLT-DEV-OTOI.md`, `CLAUDE.md`, `AGENTS.md`, and `docs/active-threads.md`.
- Confirmed Pi binary at `/home/joshd/.volta/bin/pi`.
- Confirmed `pi list` already included `/home/joshd/Desktop/nlt-repos/asfdk-harness`.
- Ran `npm run check` and `npm run build`.
- Verified built extension registration for ASFDK tools, lifecycle hooks, and slash commands.

### Pi skill discovery fix

- Added required frontmatter to `skills/asfdk-harness/SKILL.md`.
- Re-ran Pi resource discovery and confirmed:
  - extension: `src/index.ts`
  - skill: `asfdk-harness`
  - prompt: `asfdk-harness`
  - no skill or prompt diagnostics

### Personal TOI plus org OTOI combination

- Located source repos:
  - `/home/joshd/Desktop/nlt-repos/nlt-toi`
  - `/home/joshd/Desktop/nlt-repos/.github-private`
- Used `nlt-toi/packages/toi/test/fixtures/valid/josh-personal.toi` as canonical personal TOI.
- Used `.github-private/NLT-DEV-OTOI.md` as canonical org developer OTOI reference.
- Updated root `.toi` with canonical personal TOI values and source metadata.
- Added root `.otoi` charter binding `pi-asfdk-harness` and `codex` agents to `.toi`, with private `NLT-DEV-OTOI.md` referenced outside `toi_sources`.
- Updated `nltotoi.json` to point at `.toi`, `.otoi`, and source contracts.
- Validated JSON, `@neurolift-technologies/toi` parsing, and `@neurolift-technologies/otoi` honoring.

### Local runtime protocol integration

- Added `src/protocols.ts`.
- Implemented local `.toi` and `.otoi` loading.
- Implemented OTOI honor resolution via ASFDK's TOI/OTOI re-exports.
- Added protocol snapshots and constrained system-prompt formatting.
- Wired protocol context into `AsfdkHarness`.
- Wired protocol context into Pi `session_start` and `before_agent_start`.
- Added `asfdk_protocol_status` tool.
- Added `/asfdk-protocols` command.
- Documented local non-MCP runtime protocols in `docs/non-mcp-integration-protocols.md`.

### Third-party protocol focus

- Corrected the protocol scope from only local runtime protocols to third-party interoperability protocols.
- Added third-party protocol registry entries in `src/protocols.ts`:
  - A2A as primary agent-to-agent target
  - AG-UI as primary agent-to-user/frontend target
  - ACP as REST-native compatibility adapter
  - OpenAPI/REST as enterprise/API compatibility facade
  - NLIP/Open Floor as watchlist
  - MCP as a separate-owner boundary assigned to THREAD-002 / the MCP-focused agent
- Added `asfdk_interop_protocols` tool.
- Added `/asfdk-interop` command.
- Added `docs/third-party-protocols.md`.
- Updated README, skill docs, and package metadata.

## Validation Run By Codex

- `npm run check`
- `npm run build`
- Pi resource discovery smoke test
- built extension registration smoke test
- policy review smoke test
- `.toi` JSON parse and TOI parse
- `.otoi` JSON parse and OTOI honor/propagate
- protocol snapshot smoke test from `src`
- protocol snapshot smoke test from `dist`
- third-party protocol registry smoke test
- `npm pack --dry-run`

## Files Codex Added Or Edited

- `.toi`
- `.otoi`
- `nltotoi.json`
- `src/protocols.ts`
- `src/harness.ts`
- `src/index.ts`
- `src/tools.ts`
- `README.md`
- `skills/asfdk-harness/SKILL.md`
- `package.json`
- `docs/non-mcp-integration-protocols.md`
- `docs/third-party-protocols.md`
- `docs/active-threads.md`
- `docs/agent-log/registrations/2026-06-25-codex-asfdk-harness-skill-metadata.json`
- `docs/agent-log/handoffs/2026-06-25-codex-asfdk-harness-skill-metadata.json`
- `docs/agent-log/handoffs/2026-06-25-codex-toi-otoi-combine.json`
- `docs/agent-log/handoffs/2026-06-25-codex-non-mcp-protocols.json`
- `docs/agent-log/handoffs/2026-06-25-codex-third-party-protocols.json`
- `docs/agent-log/2026-06-25-codex-session-rollup.md`

## Active Threads Snapshot

### THREAD-001 — Pi ASFDK harness bootstrap

Status: In Progress

Summary: Original bootstrap thread covering Pi package, SDK runner, governance stubs, TOI/OTOI artifacts, protocol loader, third-party protocol registry, and later notes from Vibe/opencode.

Next action: Keep as umbrella thread until repo is on a PR branch with validation complete.

### THREAD-002 — MCP Server Integration

Status: In Progress

Owner: Vibe

Summary: Vibe added an MCP server path. Joshua clarified that MCP was assigned to another agent and should not be modified by Codex.

Next action: MCP-owning agent continues THREAD-002. Codex should avoid MCP implementation and focus on A2A/AG-UI/ACP.

### THREAD-003 — Third-party interoperability protocols

Status: In Progress

Owner: Codex / Joshua

Summary: A2A, AG-UI, ACP, OpenAPI/REST, and watchlist protocols are now represented in the registry and docs.

Next action: Decide whether to build an A2A Agent Card generator first or a full A2A HTTP adapter.

### THREAD-004 — Session log consolidation

Status: Complete

Owner: Codex

Summary: This rollup log and active-thread update.

## Open Decisions

- MCP ownership boundary: THREAD-002 owns MCP server work; Codex should not modify MCP implementation.
- Decide next third-party adapter implementation:
  - A2A Agent Card generator
  - full A2A HTTP adapter
  - AG-UI event adapter
  - ACP/REST compatibility facade
- Decide whether Pi package registration should remain user-level or be project-local.

## Notes For Next Agent

- Do not assume a clean git history; most repo files are currently untracked.
- Do not revert Vibe/opencode changes without explicit instruction.
- If continuing Codex protocol work, avoid `src/mcp-server.ts`, MCP package scripts, MCP dependencies, and MCP docs unless Joshua explicitly transfers that scope.
