# ASFDK Harness — Zed Dev Extension

This directory packages `asfdk-harness` as a **Zed dev extension** that provides an MCP context server.

## What it does

- Registers `asfdk-harness` under Zed `context_servers`
- Starts the ASFDK MCP server using one of these strategies:
  1. **Preferred for local dev:** `node ../dist/mcp-server.js`
  2. **Fallback:** `asfdk-harness-mcp` from your PATH
- Exposes the existing ASFDK toolset in Zed's Agent Panel

## Local setup

From repo root:

```bash
npm install
npm run build
```

In Zed:

1. Run `zed: extensions`
2. Click **Install Dev Extension**
3. Select this directory: `asfdk-harness/zed-extension`

## Optional override in Zed settings

```json
{
  "context_servers": {
    "asfdk-harness": {
      "command": {
        "path": "asfdk-harness-mcp",
        "arguments": [],
        "env": {
          "ASFDK_MODE": "unified"
        }
      }
    }
  }
}
```

## Notes

- If tools do not appear, restart Zed after installing the dev extension.
- Use `zed: open log` if startup fails.
