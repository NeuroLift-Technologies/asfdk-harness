# ASFDK-Harness + OpenCode Desktop Setup

**Date:** 2026-06-28
**Status:** ✅ Desktop Config Created

---

## Configured Applications

### 1. OpenCode CLI (Terminal) ✅
- **Config:** `~/.config/opencode/opencode.jsonc`
- **Status:** MCP server connected
- **Type:** Command-line interface
- **Usage:** `opencode` command in terminal

### 2. OpenCode Desktop App ✅ **NEW**
- **Config:** `~/.config/ai.opencode.desktop/opencode.jsonc`
- **Status:** MCP server configured
- **Type:** Desktop application (GUI)
- **Repository:** `~/.config/ai.opencode.desktop/`
- **Note:** Config created - app needs to be restarted to pick up changes

---

## What "Zen" Might Be

I couldn't find a standalone "zen" AI tool or application in your system. Could you clarify what you meant by "zen"?

**Possibilities:**
1. **Zen coding / Zenith** — A coding environment or extension?
2. **Zen mode** — A UI feature in opencode-desktop or another app?
3. **Another AI assistant** — A different tool you want configured?
4. **A custom workspace** — A directory or project name?

---

## Desktop MCP Server Setup

The opencode-desktop configuration has been created with the ASFDK governance MCP server:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "asfdk-governance": {
      "type": "remote",
      "url": "https://asfdk-governance-agent.joshdorsey.workers.dev/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer <YOUR_CLOUDFLARE_TOKEN>"
      }
    }
  }
}
```

---

## How to Use

### Terminal (CLI):
```bash
# Start OpenCode in terminal
opencode

# Use ASFDK tools in prompts
opencode "Check ASFDK status"

# List MCP servers
opencode mcp list
```

### Desktop App:
1. **Restart opencode-desktop** to pick up the new configuration
2. Open the application
3. MCP tools will be automatically available
4. Use ASFDK tools in dialogs/prompts

---

## Testing the Desktop Configuration

```bash
# Check if the config was created
cat ~/.config/ai.opencode.desktop/opencode.jsonc

# Verify syntax
node -c ~/.config/ai.opencode.desktop/opencode.jsonc
```

---

## All Configured Locations

### Opencode Configurations:
| Location | Type | Status |
|----------|------|--------|
| `~/.config/opencode/opencode.jsonc` | CLI | ✅ Connected |
| `~/.config/ai.opencode.desktop/opencode.jsonc` | Desktop | ✅ Configured |

### Vibe Configurations:
| Location | Type | Status |
|----------|------|--------|
| `~/.vibe/config.toml` | Vibe CLI | ✅ MCP Server Configured |

---

## Troubleshooting Desktop App

### If MCP server doesn't show in desktop app:

1. **Restart the application:**
   ```bash
   # Close all opencode-desktop instances
   # Then restart it from your desktop launcher
   ```

2. **Verify configuration:**
   ```bash
   cat ~/.config/ai.opencode.desktop/opencode.jsonc
   ```

3. **Check logs:**
   ```bash
   # Look for opencode-desktop in process list
   ps aux | grep opencode

   # Check application logs in:
   # ~/.local/share/opencode-desktop/logs/
   ```

4. **Test MCP server from desktop:**
   - Open a dialog
   - Type: `List MCP servers`
   - Check if "asfdk-governance" shows as connected

---

## What Was Done

1. ✅ Created opencode-desktop configuration file
   - Location: `~/.config/ai.opencode.desktop/opencode.jsonc`
   - Remote MCP server configuration
   - Authenticated with Bearer token

2. ✅ Updated documentation for desktop setup

3. ✅ Created troubleshooting guide

4. ❓ **Awaiting clarification on "zen"** — What tool/feature/application do you want configured?

---

## Next Steps (Pending "Zen" Clarification)

- [ ] Restart opencode-desktop to load new config
- [ ] Verify MCP server connection in desktop app
- [ ] Test ASFDK tools in desktop interface
- [ ] Clarify "zen" configuration requirements
- [ ] Set up Zen-specific tools if applicable
- [ ] Document Zen integration (once clarified)

---

## Configuration Comparison

| Feature | CLI | Desktop | Notes |
|---------|-----|---------|-------|
| MCP Server | `asfdk-governance` | `asfdk-governance` | Same server URL |
| Auth | Bearer Token | Bearer Token | Already configured |
| Config | `~/.config/opencode/` | `~/.config/ai.opencode.desktop/` | Separate configs |
| Used via | Terminal | GUI App | Need to restart desktop |

---

**Status:** OpenCode Desktop Configured, Awaiting "Zen" Clarification
**Last Updated:** 2026-06-28T13:53:00Z

---

## Quick Action Needed

Please clarify what you meant by **"zen"**:

1. Is it an AI assistant/agent we need to configure?
2. Is it a coding environment like Zenith?
3. Is it a UI feature (Zen mode)?
4. Is it another tool entirely?

Once I know what "zen" is, I can configure it with ASFDK the same way I did for opencode!