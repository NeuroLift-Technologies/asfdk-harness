# Installing ASFDK Harness into an Agent Runtime

One command wires the ASFDK Solidarity Framework (TOI/OTOI, RRT AIdvocAIte, Sleepwalker
Protocol) into an agent runtime:

```bash
node scripts/install.mjs
```

No external dependencies. Requires Node 20+. The installer:

1. Detects your platform and runtime.
2. For **opencode / kilo** — installs the plugin SDK deps, copies the governance
   plugins into the runtime's plugin dir, wires the `asfdk-governance` MCP server
   (local stdio transport pointing at the built `dist/mcp-server.js`), raises
   `mcp_timeout`/`timeout` to 180 s, and verifies the server answers a raw MCP
   `initialize` handshake.
3. For **hermes / openclaw / zed / pi** — runs the runtime's own install command when
   available, otherwise prints the exact documented steps.

## Flags

| Flag | Meaning |
|---|---|
| `--target <t>` | `auto` (default) \| `opencode` \| `kilo` \| `hermes` \| `openclaw` \| `zed` \| `pi` \| `list` |
| `--config-dir <p>` | Override the runtime config directory |
| `--repo <p>` | asfdk-harness checkout root (default: the repo you run it from) |
| `--state-dir <p>` | MCP working directory (default: `~/.asfdk`) |
| `--tools-gate <g>` | `approve` (default) \| `default` — pre-approve sensitive governance tools |
| `--dry-run` | Print the plan without changing anything |
| `--force` | Overwrite existing MCP config / plugin files |
| `--skip-build` | Do not (re)build `dist/` |
| `--skip-deps` | Do not `npm install` into the config dir |
| `--verbose` | Extra detail |

Example — install only into opencode, dry-run first:

```bash
node scripts/install.mjs --target opencode --dry-run
node scripts/install.mjs --target opencode
```

## What an opencode install does

| Step | Where |
|---|---|
| Deps: `@neurolift-technologies/asfdk` (>=0.2.4, runtime), `@opencode-ai/plugin` + `@types/node` (types) | `<config>/.config/opencode/package.json` |
| Plugins: `asfdk-deploy.ts`, `a2a-task-watch.ts`, `index.ts` | `<config>/.config/opencode/plugins/` |
| Config: `plugin` array, `mcp.asfdk-governance` (local stdio, 180 s), `experimental.mcp_timeout` | `<config>/.config/opencode/opencode.jsonc` |
| MCP server execution | `node <checkout>/dist/mcp-server.js`, cwd `~/.asfdk` |

The MCP server entry:

```jsonc
{
  "mcp": {
    "asfdk-governance": {
      "type": "local",
      "command": ["<node-abs>", "<checkout>/dist/mcp-server.js"],
      "enabled": true,
      "timeout": 180000,
      "cwd": "<state-dir>",
      "environment": {
        "ASFDK_GOVERNANCE_TOOLS": "approved",
        "ASFDK_TOI_PATH": "<checkout>/.toi.default",
        "ASFDK_OTOI_PATH": "<checkout>/.otoi"
      }
    }
  },
  "experimental": { "mcp_timeout": 180000 }
}
```

Existing configs are backed up (`opencode.jsonc.bak-asfdk-<ts>`) and preserved — only
missing keys are added, existing entries are left alone unless `--force`.

## Verify

1. Restart the runtime.
2. `opencode mcp list` → expect `asfdk-governance connected`.
3. Open a session and run `/mcp` → expect these 10 tools:
   `asfdk_status`, `asfdk_assess_text`, `asfdk_update_preferences`, `asfdk_health_check`,
   `asfdk_review_tool_call`, `asfdk_process_interaction`, `asfdk_governance_summary`,
   `asfdk_authority_chain`, `asfdk_governance_raw`, `asfdk_discovery_hub`.
4. Plugin lifecycle messages appear on stderr:
   `[asfdk-deploy] foundation-ready ...` and `[asfdk-deploy] message-assessment ...`.
   `[a2a-task-watch] disabled no hub URL ...` is benign (A2A hub is optional).

## Runtime matrix

| Runtime | Installer support | Notes |
|---|---|---|
| opencode | **Full automation** | Shown above. |
| kilo | **Full automation** (same opencode format) | Uses `<config>/.config/kilo` unless `--config-dir`. |
| hermes | Best-effort copy | `~/.hermes/plugins/`; requires the asfdk Python package. |
| openclaw | Command print / run | `openclaw plugin add <repo>/openclaw-plugin`. |
| zed | Manual (documented) | Rust dev extension; MCP `context_servers` with **absolute** node + `dist/mcp-server.js` paths (see `zed-extension/README.md`, THREAD-012). |
| pi | Manual (documented) | `pi package add <repo>`; skills/prompts in `skills/`, `prompts/`. |

## Troubleshooting

### "server unavailable" / "-32001 request timed out" on first spawn
This happens when the MCP server cold-start exceeds the client timeout (Windows
Defender / antivirus scans can add 20-30 s to first import of `@neurolift-technologies/asfdk`).
- This installer sets `timeout` + `mcp_timeout` to 180 000 ms.
- opencode auto-retries a failed first spawn; a WARN that is not repeated is benign.
- On Windows, the FIRST cold boot is expected to be slower (Defender real-time scans on
  first import of `@neurolift-technologies/asfdk`). If boots stay slow after the first,
  scope a Defender exclusion to the exact paths only (elevated PowerShell) and
  prefer the least-broad scope:
  ```powershell
  Add-MpPreference -ExclusionPath "C:\path\to\asfdk-harness"
  ```
  Add additional exclusions only as needed (e.g. `$env:USERPROFILE\.asfdk`,
  `$env:USERPROFILE\.config\opencode`), not drive-wide or user-home-wide.

### `chat.message` produces no text / assessments never fire
Your plugin SDK must be `@opencode-ai/plugin >= 1.18`. Message content is delivered in
the **second** hook argument (`output.parts`, `Part[]` with `{ type: "text", text }`),
not `input.parts`. The bundled plugins already use `output.parts`; refresh any stale
copies from `opencode-plugin/`.

### Slow boot even with correct timeouts
Trim LSP servers. In `opencode.jsonc` replace `"lsp": true` with only the servers you
use (e.g. `{"typescript": true, "pyright": true, "bash": true, "yaml-ls": true}`).
Enable only the plugin files you need — `a2a-task-watch` is optional and no-ops
without `hubUrl` / `ASFDK_A2A_HUB_URL`.

### `@neurolift-technologies/asfdk@0.2.4` has no type declarations (dev only)
The published 0.2.4 tarball ships `dist/*.js` + `*.js.map` + `*.d.ts.map` but **no `*.d.ts`**
(verified against the registry tarball; 0.2.2 ships types but with the OLD API that the
plugins no longer use). This does **not** affect installed runtimes — opencode loads
plugin `.ts` files through esbuild, which strips types without resolving `.d.ts`. It only
matters if you typecheck the plugin sources yourself; in that case build `asfdk` from
source (`npm run build` in `packages/asfdk`) before typechecking. Upstream bug to raise
with the asfdk repo.

### Bundling the MCP server into one file
Do not. esbuild/bundling `dist/mcp-server.js` breaks zod v4 (`TypeError: Class2 is not a
constructor`). The stdio server is meant to run from Node with `node_modules` present.

## Files owned by this feature

- `scripts/install.mjs` — universal installer
- `opencode-plugin/` — canonical opencode/kilo plugins (`asfdk-deploy.ts`,
  `a2a-task-watch.ts`, `index.ts`)
- `kilo-plugin/` — mirror of the above (keep in sync)
- `docs/opencode-setup-complete.md`, `docs/opencode-desktop-setup.md` — pre-installer
  setup guides using the remote Cloudflare Worker MCP (`ASFDK_GOVERNANCE_TOOLS`
  token) instead of the local server.

*Governance: configured per ORG-DEV-OTOI-1.0.3. Final authority: Joshua W. Dorsey, Sr.*