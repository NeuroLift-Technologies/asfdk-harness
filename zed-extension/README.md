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
npm link
```

`npm link` makes the `asfdk-harness-mcp` fallback command (used whenever the `../dist/mcp-server.js` auto-detect misses, which is the common case
for an *installed* dev extension) resolve on your `PATH`. This is the recommended, durable setup — see the Troubleshooting section below for why.

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

the Rust extension compiled fine, but the process it launched never answered the MCP `initialize` handshake. There were two contributing causes, both now fixed:

1. **(Root cause, fixed in source.)** `src/mcp-server.ts` (and `a2a-proxy.ts`, `discovery-hub.ts`, `mcp-http-server.ts`) used the common
   `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` idiom to guard their `main()` call. That check breaks whenever
   the script is invoked through a symlink — which is exactly how npm/pnpm/yarn wire up `package.json#bin` commands, including `npm link`. Node
   resolves `import.meta.url` to the module's real, symlink-resolved path, but leaves `process.argv[1]` as the path that was actually invoked (the
   symlink), so the two never matched. `main()` silently never ran, and the process exited cleanly (exit 0) without ever touching stdio — which is
   indistinguishable from a hang to a client that's waiting on a response. Fixed by comparing realpaths on both sides (`src/entrypoint.ts`,
   `isMainModule()`), which works for direct invocation, `npm link`, and global installs alike.
2. `std::env::current_dir()` inside the WASM sandbox does not reliably resolve to this repo checkout for the `../dist/mcp-server.js` auto-detect —
   it can reflect Zed's own installed-extension copy instead, so that lookup can silently miss and fall through to the `asfdk-harness-mcp` PATH
   fallback. That fallback only exists once you've run `npm link` from the repo root — and, before the fix above, it was broken by cause #1 even
   when it *was* on PATH.

With the source fix in place, running `npm link` from the repo root (after `npm run build`) is sufficient — no Zed settings override is required.

**Optional belt-and-suspenders fix:** you can still bypass auto-detection entirely with an explicit absolute-path override in Zed settings
(`zed: open settings`):

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

Find your absolute node path with `command -v node` (or, if using nvm, `ls ~/.nvm/versions/node`).

> **Heads up:** clicking **Configure** on the context server in Zed's Extensions panel appears to rewrite this settings block back to the
> extension's bare defaults (`{}`), dropping any `command` override you added. If you rely on the settings override, avoid clicking Configure, or
> just re-apply it afterward. This is why the source-level fix above (which needs no override) is the durable solution.

Verify any command works before restarting Zed by piping a raw MCP handshake at it — including through a symlink, to catch cause #1 above:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}' | node /absolute/path/to/asfdk-harness/dist/mcp-server.js
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}' | asfdk-harness-mcp
```

A correctly working server responds immediately with a `{"result":{"protocolVersion":...}}` line on both. If the direct-path invocation responds
but the PATH/symlink one doesn't, you've hit cause #1 (rebuild after pulling this fix). If neither responds, the problem is in `dist/mcp-server.js`
itself (rebuild with `npm run build`), not in Zed or the extension.

## Notes

- If tools do not appear, restart Zed after installing the dev extension.
- Use `zed: open log` if startup fails.
- A "failed to compile Rust extension" / rustup error (`rustup could not choose a version of rustc to run`) is a *separate* issue from the timeout above — it means no default Rust toolchain is configured for the account that launched Zed. Fix with `rustup default stable` (or pin `zed-extension/rust-toolchain.toml`, already included in this repo) and fully restart Zed so its background process picks up the change.
