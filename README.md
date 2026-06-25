# asfdk-harness

ASFDK Harness is a Pi package and SDK runner that puts `@neurolift-technologies/asfdk` on top of Pi as governance middleware.

It adds Solidarity Framework hooks around Pi sessions so prompts and tool calls can pass through ASFDK-adjacent governance checks before execution.

## What it provides

- **Pi extension package** via `pi.extensions`
- **ASFDK tools** registered in Pi:
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

## Environment

```bash
ASFDK_USER_ID=pi-user
ASFDK_MODE=unified # unified | crisis_only | continuity | framework | development
ASFDK_TOI_PATH=.toi
ASFDK_OTOI_PATH=.otoi
```

## Non-MCP protocols

The harness integrates through local files, Pi extension hooks, Pi tools, slash commands, and the SDK/CLI runner. It also tracks third-party interoperability targets such as A2A, AG-UI, and ACP, and can generate an A2A Agent Card from the active governance snapshot. MCP work is handled separately under `THREAD-002`.

See [docs/non-mcp-integration-protocols.md](docs/non-mcp-integration-protocols.md).
See [docs/third-party-protocols.md](docs/third-party-protocols.md).

## Architecture

```text
User / Pi prompt
      ↓
Pi extension lifecycle hooks
      ↓
Local .toi + .otoi protocol resolution
      ↓
ASFDK Harness
      ↓
@neurolift-technologies/asfdk
  • TOI / OTOI governance
  • RRT Advocate signals
  • Sleepwalker continuity signals
      ↓
Pi model + tools
```

The default posture is advisory/observe. The harness only blocks obviously high-risk local tool patterns by default.
