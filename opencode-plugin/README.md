# opencode-plugin

Canonical source for the **opencode / kilo** ASFDK plugins. `scripts/install.mjs` copies
these files into a runtime's plugin directory and wires the MCP server.

## Contents

| File | Purpose |
|---|---|
| `asfdk-deploy.ts` | Monitor-only governance: observes chat messages and tool results through the ASFDK foundation (TOI/OTOI, RRT AIdvocAIte, Sleepwalker). Logs gate-up escalations; does not block. |
| `a2a-task-watch.ts` | Optional A2A task poller for the discovery hub. No-op unless `hubUrl` option or `ASFDK_A2A_HUB_URL` is set. |
| `index.ts` | Named re-exports for programmatic loading. |
| `package.json` | Metadata + dependency contract for the config-dir install. |

## API compatibility

Requires `@opencode-ai/plugin >= 1.18`. The `chat.message` hook reads message content
from the **second** hook argument (`output.parts`, `Part[]` with `{ type: "text", text }`).
Reading from the first argument silently yields an empty string on this SDK generation.

## Mirror policy

`kilo-plugin/` mirrors `asfdk-deploy.ts` and `a2a-task-watch.ts` from here. When editing
these files, apply the same change to `kilo-plugin/` (kept in sync manually — see
`kilo-plugin/README.md`).