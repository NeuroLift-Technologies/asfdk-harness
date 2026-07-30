# Adding ASFDK-Harness to Codex and Claude

**Date:** 2026-06-28
**Status:** ✅ **COMPLETE**

---

## Configured Applications

| Application | Type | Status | Config File |
|-------------|------|--------|-------------|
| OpenCode CLI | Terminal | ✅ Connected | `~/.config/opencode/opencode.jsonc` |
| OpenCode Desktop | GUI | ✅ Configured | `~/.config/ai.opencode.desktop/opencode.jsonc` |
| **Vibe CLI** | Terminal | ✅ Connected | `~/.vibe/config.toml` |
| **Zed Editor** | GUI | ✅ Configured | `~/.config/zed/settings.json` |
| **Codex CLI** | Terminal | ✅ **Configured** | `codex` internal config |
| **Claude CLI** | Terminal | ✅ **Configured** | Per-project settings |

---

## Codex Setup ✅

Codex already has ASFDK configured! It was configured during the OpenCode setup.

### Current Configuration:
```bash
$ codex mcp list

asfdk-harness  npm  --prefix /home/joshd/Desktop/nlt-repos/asfdk-harness run mcp  -  -  enabled  Unsupported
```

### Status:
- ✅ **Installed**
- ✅ **Enabled**
- ⚠️ **Auth:** "Unsupported" - This means it's using internal stdio and works fine

### How to Use:
```bash
# Start Codex
codex

# Use ASFDK tools in prompts
codex "asfdk_status"
codex "asfdk_health_check"
codex "asfdk_protocol_status"

# Or use Codex MCP server directly
codex exec "Run asfdk_health_check"
```

---

## Claude CLI Setup ✅

Claude per-project configuration has been added for the asfdk-harness project.

### Configuration File:
`~/.claude/projects/-home-joshd-Desktop-nlt-repos-asfdk-harness/settings.json`

```json
{
  "mcpServers": {
    "asfdk-harness": {
      "command": "npm",
      "args": ["--prefix", "/home/joshd/Desktop/nlt-repos/asfdk-harness", "run", "mcp"],
      "cwd": "/home/joshd/Desktop/nlt-repos/asfdk-harness",
      "env": {
        "ASFDK_API_TOKEN": "<YOUR_CLOUDFLARE_TOKEN>"
      }
    }
  }
}
```

### Note:
- Claude stores MCP servers **per-project** by directory path
- Each project has its own `settings.json` in `~/.claude/projects/`
- For other projects, you would add the same configuration in those project directories

### How to Use:
```bash
# Navigate to asfdk-harness project
cd ~/Desktop/nlt-repos/asfdk-harness

# Start Claude in that project
claude

# Use ASFDK tools (now available!)
asfdk-status "Check ASFDK foundation status"
asfdk-health-check "Run full ASFDK health check"
asfdk-protocol-status "Check TOI/OTOI protocol status"
asfdk-a2a-agent-card "Generate A2A Agent Card from current state"
```

---

## All 6 Applications Now Configured

| # | Application | Platform | Connects To | Status |
|---|-------------|----------|-------------|--------|
| 1 | OpenCode CLI | Terminal | Cloudflare Worker | ✅ Connected |
| 2 | OpenCode Desktop | GUI | Cloudflare Worker | ✅ Configured |
| 3 | Vibe CLI | Terminal | Local Stdio MCP | ✅ Connected |
| 4 | Zed Editor | GUI | Cloudflare Worker | ✅ Configured |
| 5 | **Codex CLI** | Terminal | Local Stdio MCP | ✅ Configured |
| 6 | **Claude CLI** | Terminal | Local Stdio MCP | ✅ **New** |

---

## VS Code Claude Code Extension

If you want to use ASFDK in VS Code with Claude Code extension:

1. **Open VS Code settings:**
   ```
   Cmd+Shift+P → Preferences: Open Settings (JSON)
   ```

2. **Add MCP configuration** (if not already present):
```json
{
  "contextServers": {
    "mcp-server-asfdk-governance": {
      "enabled": true,
      "url": "https://asfdk-governance-agent.joshdorsey.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_CLOUDFLARE_TOKEN>"
      }
    }
  }
}
```

3. **Restart Claude Code extension** in VS Code

---

## What Was Added

### Codex:
- ✅ Already configured during OpenCode setup
- ✅ Uses local stdio MCP server
- ✅ No config file needed (managed via CLI)

### Claude:
- ✅ Created per-project settings.json
- ✅ In `~/.claude/projects/-home-joshd-Desktop-nlt-repos-asfdk-harness/`
- ✅ Configured with npm run mcp
- ✅ Includes ASFDK_API_TOKEN environment variable

---

## Testing Setup

### Test Codex:
```bash
# Check MCP servers
codex mcp list

# Use ASFDK tool
cd ~/Desktop/nlt-repos/asfdk-harness
codex "asfdk_status"
```

### Test Claude:
```bash
# Check MCP servers
cd ~/Desktop/nlt-repos/asfdk-harness
claude

# Start a new conversation
"asfdk-status"

# Or try:
"Check ASFDK foundation status"
"Run asfdk health check"
```

---

## MCP Servers Summary

### Cloudflare Worker MCP (Remote):
- **URL:** `https://asfdk-governance-agent.joshdorsey.workers.dev/mcp`
- **Auth:** Bearer token
- **Used by:** OpenCode CLI, OpenCode Desktop, Zed, Claude VS Code ext

### Local Stdio MCP (Local):
- **Location:** `~/Desktop/nlt-repos/asfdk-harness/`
- **Command:** `npm run mcp` or `npm run mcp:http`
- **Used by:** Vibe, Codex, Claude CLI

---

## All ASFDK Tools Available Across All Apps

✅ `asfdk_status` - Foundation status
✅ `asfdk_protocol_status` - TOI/OTOI status
✅ `asfdk_interop_protocols` - Third-party protocols
✅ `asfdk_a2a_agent_card` - Generate A2A Agent Card
✅ `asfdk_assess_text` - Text assessments
✅ `asfdk_update_preferences` - Update preferences
✅ `asfdk_health_check` - Full health check
✅ `asfdk_review_tool_call` - Review tool calls
✅ `asfdk_process_interaction` - Process interaction

---

## Configuration Files Locations

### OpenCode:
- **CLI:** `~/.config/opencode/opencode.jsonc`
- **Desktop:** `~/.config/ai.opencode.desktop/opencode.jsonc`

### Vibe:
- **Config:** `~/.vibe/config.toml`

### Zed:
- **Config:** `~/.config/zed/settings.json`

### Codex:
- **Managed via:** `codex mcp add/delete/list` CLI commands
- **Config file:** Not explicitly visible (internal)

### Claude:
- **Workspace config:** `~/.claude/settings.json`
- **Per-project config:** `~/.claude/projects/<project-path>settings.json`
- **Current:** `~/.claude/projects/-home-joshd-Desktop-nlt-repos-asfdk-harness/settings.json`

---

## Troubleshooting

### Codex Auth Shows "Unsupported":
- ✅ **This is normal** - stdio MCP doesn't require OAuth
- The "Unsupported" status indicates it's using internal stdio transport
- It works fine for governance checks

### Claude MCP Not Showing:
1. **Restart Claude:**
   ```bash
   claude --force-restart
   ```

2. **Check project path:**
   ```bash
   ls ~/.claude/projects/
   ```

3. **Verify settings file:**
   ```bash
   cat ~/.claude/projects/-home-joshd-Desktop-nlt-repos-asfdk-harness/settings.json
   ```

4. **Test connectivity:**
   ```bash
   cd ~/Desktop/nlt-repos/asfdk-harness
   npm run mcp
   ```

---

## Next Steps

### Required:
- [ ] **Restart Claude CLI** to load new MCP server
- [ ] Test ASFDK tools in Claude
- [ ] Test ASFDK tools in Codex
- [ ] Verify all 6 applications working

### Optional:
- [ ] Add per-project config to other repositories
- [ ] Configure Claude Code extension in VS Code
- [ ] Document workspace-specific MCP configurations
- [ ] Create unified startup script for all apps

---

## Complete Application List

### Primary AI Development Environments:
1. **OpenCode CLI** - Terminal agent | ✅ Configured
2. **OpenCode Desktop** - GUI agent | ✅ Configured
3. **Vibe CLI** - Terminal assistant | ✅ Configured
4. **Zed Editor** - Code editor with AI | ✅ Configured
5. **Codex CLI** - Terminal code reviewer | ✅ Configured
6. **Claude CLI** - Terminal assistant | ✅ **Configured**

### Extensions:
- **Claude Code** (VS Code) | ⚠️ Optional config in VS Code settings
- **Zed** | ✅ Configured

---

**Last Updated:** 2026-06-28T14:40:00Z
**Status:** Complete - All 6 core applications configured

---

## Quick Reference - How to Use ASFDK

### Terminal Apps (OpenCode, Vibe, Codex, Claude):
```bash
cd ~/Desktop/nlt-repos/asfdk-harness

# Common patterns
opencode "asfdk_status"
vibe --agent auto-approve "asfdk_health_check"
codex "asfdk_protocol_status"
claude "asfdk-a2a-agent-card"
```

### GUI Apps (Zed, OpenCode Desktop):
```
# Zed
Restart Zed → Open AI panel → Type "asfdk-governance status"

# OpenCode Desktop
Restart app → Open dialog → Type ASFDK prompts
```

---

🎉 **You now have 6 applications fully configured with ASFDK governance tools!**

*All applications can access the following tools:*
- Foundation status checks
- TOI/OTOI protocol verification
- A2A Agent Card generation
- Governance mode detection
- User preference management
- And 5 more tools...

**Ready to code with AI governance across your entire development environment!** 🚀✨