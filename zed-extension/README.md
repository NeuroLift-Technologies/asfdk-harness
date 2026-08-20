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

## Troubleshooting: "Context server request timeout"

If Zed's log (`zed: open log`) shows:

```
ERROR [context_server::client] cancelled csp request task for "initialize" id 0 which took over 60s
ERROR [project::context_server_store] asfdk-harness context server failed to start: Context server request timeout
```

the Rust extension compiled fine, but the process it launched never answered the MCP `initialize` handshake. This almost always means the auto-detect strategies above both failed silently:

1. `std::env::current_dir()` inside the WASM sandbox does not reliably resolve to this repo checkout — it can reflect Zed's own installed-extension copy instead, so the `../dist/mcp-server.js` relative lookup silently misses.
2. The `asfdk-harness-mcp` PATH fallback only exists if you ran `npm link` from the repo root.

**Fix:** bypass auto-detection entirely with an explicit absolute-path override in Zed settings (`zed: open settings`):

```json
{
  "context_servers": {
    "asfdk-harness": {
      "enabled": true,
      "remote": false,
      "command": {
        "path": "/absolute/path/to/node",
        "arguments": ["/absolute/path/to/asfdk-harness/dist/mcp-server.js"],
        "env": {}
      },
      "settings": {}
    }
  }
}
```

Find your absolute node path with `command -v node` (or, if using nvm, `ls ~/.nvm/versions/node`). Verify the exact command works before restarting Zed by piping a raw MCP handshake at it:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}' | node /absolute/path/to/asfdk-harness/dist/mcp-server.js
```

A correctly working server responds immediately with a `{"result":{"protocolVersion":...}}` line. If that hangs, the problem is in `dist/mcp-server.js` (rebuild with `npm run build`), not in Zed or the extension.

## Notes

- If tools do not appear, restart Zed after installing the dev extension.
- Use `zed: open log` if startup fails.
- A "failed to compile Rust extension" / rustup error (`rustup could not choose a version of rustc to run`) is a *separate* issue from the timeout above — it means no default Rust toolchain is configured for the account that launched Zed. Fix with `rustup default stable` (or pin `zed-extension/rust-toolchain.toml`, already included in this repo) and fully restart Zed so its background process picks up the change.
