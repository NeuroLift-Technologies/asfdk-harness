# asfdk-harness

ASFDK Harness is the Solidarity Framework runtime / control plane for governing agent sessions, A2A delegation, MCP/tool surfaces, TOI/OTOI resolution, preflight checks, receipts, and escalation across NeuroLift agent runtimes.

It adds Solidarity Framework hooks around agent runtime sessions so prompts and tool calls can pass through ASFDK-adjacent governance checks before execution.

## What it provides

- **Pi cofounder-agent extension** (first supported runtime) via `pi.extensions`
- **ASFDK tools** registered in the active runtime:
  - `asfdk_a2a_agent_card`
  - `asfdk_status`
  - `asfdk_protocol_status`
  - `asfdk_interop_protocols`
  - `asfdk_assess_text`
  - `asfdk_update_preferences`
- **MCP Server** exposing ASFDK tools via Model Context Protocol
- **TOI/OTOI protocol loader** for local `.toi` and `.otoi`
- **Third-party protocol registry** for A2A, AG-UI, ACP, OpenAPI/REST, and watchlist protocols
- **A2A Agent Card generator** derived from the active TOI/OTOI snapshot and third-party registry
- **Turn preflight hook** using ASFDK assessment context
- **Tool-call policy hook** for high-risk shell commands and sensitive local paths
- **Standalone SDK runner** for one-shot Pi prompts with ASFDK hooks enabled
- **Zed dev extension wrapper** (`zed-extension/`) for MCP context-server installation in Zed
- **Skill and prompt resources** for Pi discovery

## Install locally in Pi

From this repository:

```bash
npm install
pi install .
```

Then restart or run `/reload` in Pi.

## Development

```bash
npm run check
npm run build
npm run harness -- "What files are in this repo?"
```

> **Workers types:** run `npm run cf:typegen` (`wrangler types`) to generate `worker-configuration.d.ts` before `npm run cf:check` or `npm run cf:deploy`. This file is gitignored and not committed.

## Zed Dev Extension

A local Zed dev extension is included at `zed-extension/`.

From the repo root:

```bash
npm install
npm run build
```

Then in Zed:

1. Run `zed: extensions`
2. Click **Install Dev Extension**
3. Select `asfdk-harness/zed-extension`

See `zed-extension/README.md` for command override options.

## MCP Server

Run the MCP server to expose ASFDK capabilities via Model Context Protocol:

```bash
npm run mcp
# or
npx asfdk-harness-mcp
```

### MCP Tools Available

- `asfdk_status` - Get ASFDK foundation status and component health
- `asfdk_assess_text` - Assess text through ASFDK's Solidarity Framework
- `asfdk_update_preferences` - Validate/update user preferences through TOI/OTOI
- `asfdk_health_check` - Run ASFDK foundation health check
- `asfdk_review_tool_call` - Review tool calls against harness policy
- `asfdk_process_interaction` - Process interactions through ASFDK governance

### MCP Integration

The MCP server communicates via stdio. Configure your MCP-compatible client to start the server with the command `asfdk-harness-mcp`.

### Local MCP URL

For clients that expect a URL, run the local HTTP transport:

```bash
npm run mcp:http
```

It listens on `http://127.0.0.1:8788/mcp` by default. Override `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, or `MCP_HTTP_PATH` if needed.

### Cloudflare Worker MCP

The Cloudflare Worker now also serves `/mcp` behind the same bearer token gate as the agent route. After deploy, the MCP URL is the Worker origin plus `/mcp`.

#### Verify the endpoint

Test the deployed MCP endpoint with a real handshake. Put the token in an env var and keep the command on **one line** — splitting it with a `\` can wrap a space into the URL and produce `curl: (3) URL rejected: Malformed input to a URL function` (a client-side URL-parse error, not a server fault):

```bash
export ASFDK_TOKEN="cfat_...your_token..."
curl -sS -X POST https://<your-worker-origin>/mcp -H "Authorization: Bearer $ASFDK_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"diag","version":"0.0.0"}}}'
```

A healthy server returns HTTP 200 and an SSE event containing `"serverInfo":{"name":"asfdk-harness",...}`. A missing/invalid token returns `401 Unauthorized`.

## Environment

```bash
ASFDK_USER_ID=asfdk-user
ASFDK_SESSION_ID=auto  # auto-generated UUID if unset
ASFDK_MODE=unified # unified | crisis_only | continuity | framework | development
ASFDK_TOI_PATH=.toi # optional; defaults to .toi when present, otherwise .toi.default
ASFDK_OTOI_PATH=.otoi
```

## Non-MCP protocols

The harness integrates through local files, runtime extension hooks (e.g. Pi), runtime tools, slash commands, and the SDK/CLI runner. Pi is the first supported cofounder-agent runtime. It also tracks third-party interoperability targets such as A2A, AG-UI, and ACP, and can generate an A2A Agent Card from the active governance snapshot. MCP work is handled separately under `THREAD-002`.

See [docs/non-mcp-integration-protocols.md](docs/non-mcp-integration-protocols.md).
See [docs/third-party-protocols.md](docs/third-party-protocols.md).

## Architecture

```text
User / agent runtime prompt (Pi, Claude Code, ...)
      ↓
Runtime extension lifecycle hooks
      ↓
Local .toi/.toi.default + .otoi protocol resolution
      ↓
ASFDK Harness (Solidarity Framework control plane)
      ↓
@neurolift-technologies/asfdk
  • TOI / OTOI governance
  • RRT Advocate signals
  • Sleepwalker continuity signals
      ↓
Runtime model + tools
```

Pi is the first supported cofounder-agent runtime. The harness is designed to support additional NeuroLift agent runtimes with the same governance middleware.

The default posture is advisory/observe. The harness only blocks obviously high-risk local tool patterns by default.
