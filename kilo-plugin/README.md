# kilo-plugin

OpenCode-formatted ASFDK plugin sources for the kilo runtime family
(`@opencode-ai/plugin` API).

## Status

These two files **mirror** the canonical sources in `opencode-plugin/`:

| This dir | Canonical |
|---|---|
| `asfdk-deploy.ts` | `opencode-plugin/asfdk-deploy.ts` |
| `a2a-task-watch.ts` | `opencode-plugin/a2a-task-watch.ts` |
| `index.ts` | `opencode-plugin/index.ts` |

Keep them in sync when editing. The installer (`scripts/install.mjs`) copies from
`opencode-plugin/`, which is the single source of truth.