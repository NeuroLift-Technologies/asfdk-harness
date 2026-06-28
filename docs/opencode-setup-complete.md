# ASFDK-Harness + OpenCode Setup Complete

**Date:** 2026-06-28
**Status:** ✅ Fully Operational

---

## Configured Integration

### 1. OpenCode MCP Server (Remote)
- **Type:** Cloudflare Worker (remote stdio)
- **URL:** `https://asfdk-governance-agent.joshdorsey.workers.dev/mcp`
- **Auth:** Bearer token (configured in opencode config)
- **Status:** ✅ Connected

**Config Location:** `~/.config/opencode/opencode.jsonc`

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "asfdk-governance": {
      "type": "remote",
      "url": "https://asfdk-governance-agent.joshdorsey.workers.dev/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

### 2. Local MCP Server (Alternative)
- **Location:** `~/Desktop/nlt-repos/asfdk-harness`
- **Transport:** stdio
- **Command:** `npm run mcp`
- **Transport:** `streamable-http` (port 8788)

Available in Vibe config at `~/.vibe/config.toml`:
```toml
[[mcp_servers]]
name = "asfdk-harness"
transport = "stdio"
command = "npm"
args = ["run", "mcp"]
cwd = "/home/joshd/Desktop/nlt-repos/asfdk-harness"
```

---

## Available ASFDK MCP Tools

Once connected, opencode can access:

1. **`asfdk_status`** — Get ASFDK foundation status and component health
2. **`asfdk_protocol_status`** — Check TOI/OTOI integration protocol status
3. **`asfdk_interop_protocols`** — View third-party protocol targets and MCP exclusion status
4. **`asfdk_a2a_agent_card`** — Generate a TOI/OTOI-governed A2A Agent Card
5. **`asfdk_assess_text`** — Assess text through ASFDK's Solidarity Framework
6. **`asfdk_update_preferences`** — Validate/update user preferences through TOI/OTOI
7. **`asfdk_health_check`** — Run ASFDK foundation health check
8. **`asfdk_review_tool_call`** — Review tool calls against harness policy
9. **`asfdk_process_interaction`** — Process interactions through ASFDK governance

---

## Usage Examples

### Start OpenCode with ASFDK harness:
```bash
# Start in current directory
opencode

# Or specify a project directory
opencode ~/Desktop/nlt-repos/asfdk-harness
```

### Use ASFDK tools in prompts:
```bash
opencode "Check the ASFDK protocol status and current governance mode"

# Check foundation health
opencode "Run an ASFDK health check"

# Get A2A agent card info
opencode "Generate an A2A Agent Card from current TOI/OTOI state"
```

### List MCP servers:
```bash
opencode mcp list
```

### Authenticate with remote server (if needed):
```bash
opencode mcp auth asfdk-governance
```

---

## Troubleshooting

### MCP server shows "needs authentication":
```bash
# Manually trigger OAuth flow
opencode mcp auth asfdk-governance

# Or verify config has correct Authorization header
# Config location: ~/.config/opencode/opencode.jsonc
```

### Connection fails:
```bash
# Put the token in an env var first (never paste it inline into the curl line).
export ASFDK_TOKEN="cfat_...your_token..."

# Test the server with a real MCP handshake. Keep this on ONE line — do not
# split it across lines with a backslash. A wrapped/indented URL can introduce a
# stray space and make curl reject it with:
#   curl: (3) URL rejected: Malformed input to a URL function
curl -sS -X POST https://asfdk-governance-agent.joshdorsey.workers.dev/mcp -H "Authorization: Bearer $ASFDK_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"diag","version":"0.0.0"}}}'

# A working server returns HTTP 200 and an SSE event containing:
#   "serverInfo":{"name":"asfdk-harness","version":"0.1.0"}
```

> **`curl: (3) URL rejected: Malformed input to a URL function`** is a curl URL-parse
> error (it happens before any request is sent). It means the URL string contains a
> space or invisible character — almost always from copy-pasting a multi-line command
> where the wrap put whitespace inside the URL. Retype the URL on a single line, or
> paste it between quotes, and the error disappears. It is **not** a server problem.

### Token expired or changed:
```bash
# Update token in config
cd ~/.config/opencode
# Edit opencode.jsonc to update Authorization header

# Or create/update .dev.vars with new token
cd ~/Desktop/nlt-repos/asfdk-harness
nano .dev.vars
```

---

## Vibe Integration

Vibe also has the asfdk-harness MCP server configured:

**Local MCP:**
```bash
# Start local asfdk-harness MCP server
cd ~/Desktop/nlt-repos/asfdk-harness
npm run mcp:http  # or npm run mcp

# Runs on http://127.0.0.1:8788/mcp
```

**Use in Vibe:**
```bash
vibe --agent auto-approve "Check ASFDK status and generate A2A agent card"
```

---

## Security Notes

⚠️ **IMPORTANT:**

1. The Bearer token in the opencode config file is currently **insecure** for production
2. For production use, use environment variables or auth tokens
3. Do not commit the config file to version control
4. Rotate the token regularly

**Recommended secure approach (not yet configured):**
```jsonc
{
  "mcp": {
    "asfdk-governance": {
      "type": "remote",
      "url": "https://asfdk-governance-agent.joshdorsey.workers.dev/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "{env:ASFDK_CLIENT_ID}",
        "clientSecret": "{env:ASFDK_CLIENT_SECRET}"
      }
    }
  }
}
```

---

## Next Steps (Optional)

### What to configure next:

1. **[ ] Rotate the Bearer token** — Generate a new token in Cloudflare dashboard
2. **[ ] Set up environment variables** — Use OAuth with client credentials instead of static tokens
3. **[ ] Enable local asfdk-harness** — Run local MCP server for offline development
4. **[ ] Add to ASFDK repo** — Document this configuration in the repo's setup guide
5. **[ ] Test all tools** — Run through each of the 9 MCP tools to verify they work
6. **[ ] Create a startup script** — Automate starting opencode + MCP server together

### MD: Log to Notion (NLT-GOV-2026-003)
- [ ] Document setup in governance observables
- [ ] Note any issues encountered
- [ ] Capture working configurations

---

**Status:** ✅ Operational and ready to use
**Last Updated:** 2026-06-28T13:38:00Z