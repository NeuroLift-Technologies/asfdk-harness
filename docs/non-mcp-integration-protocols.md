# Non-MCP Runtime Protocols

`asfdk-harness` integrates TOI/OTOI governance through local runtime protocols. Third-party protocol targets such as A2A, ACP, and AG-UI are tracked separately in [third-party-protocols.md](third-party-protocols.md).

MCP work is owned by `THREAD-002` and a separate agent. This document does not define or modify that MCP implementation.

## Supported protocols

| Protocol | Source | Runtime path | Purpose |
|---|---|---|---|
| Local TOI file | `.toi` or `ASFDK_TOI_PATH` | `loadGovernanceProtocols()` | Parse the personal Terms of Interaction with ASFDK's TOI re-export. |
| Local OTOI charter | `.otoi` or `ASFDK_OTOI_PATH` | `loadGovernanceProtocols()` | Resolve the active TOI stack and agent bindings with ASFDK's OTOI re-export. |
| Pi extension hooks | `src/index.ts` | `session_start`, `before_agent_start`, `tool_call` | Load protocol context, append a constrained system-prompt fragment, and enforce local tool policy. |
| Pi tool protocol | `src/tools.ts` | `asfdk_status`, `asfdk_protocol_status`, `asfdk_assess_text`, `asfdk_update_preferences` | Expose status, protocol inspection, assessment, and preference update actions inside Pi. |
| Slash-command protocol | `src/index.ts` | `/asfdk-status`, `/asfdk-protocols`, `/asfdk-assess` | Let a human inspect protocol state and ASFDK status from Pi. |
| SDK/CLI runner | `src/cli.ts` | `npm run harness -- "prompt"` | Run a one-shot Pi session with the same extension and protocols loaded. |
| Local tool-call policy | `src/policy.ts` | Pi `tool_call` hook | Block high-risk shell patterns and sensitive local path access. |

## MCP ownership boundary

MCP is intentionally out of scope for this Codex local-runtime-protocol lane.

- Do not edit `src/mcp-server.ts`.
- Do not change MCP package scripts, dependencies, tool definitions, or documentation.
- Coordinate with the MCP-owning agent through `docs/active-threads.md`.

If local runtime protocol work needs MCP context later, read `THREAD-002` first and ask Joshua before touching MCP-owned files.

## Runtime flow

```text
Pi session / SDK runner
      |
      v
src/index.ts extension hooks
      |
      v
src/protocols.ts
  - read .toi
  - read .otoi
  - honor OTOI against local TOI sources
  - build protocol snapshot
  - build constrained system prompt fragment
      |
      v
ASFDK foundation + Pi tools + local policy
```

## Environment

```bash
ASFDK_TOI_PATH=.toi
ASFDK_OTOI_PATH=.otoi
```

Both paths resolve relative to Pi's active project cwd unless absolute paths are provided.

## Validation

```bash
npm run check
npm run build
node -e 'import("./dist/protocols.js").then(async m => console.log(JSON.stringify(m.createProtocolSnapshot(await m.loadGovernanceProtocols({ cwd: process.cwd() })), null, 2)))'
```
