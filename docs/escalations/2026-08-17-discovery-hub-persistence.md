## Escalation Record

**Date:** 2026-08-17T23:05:00Z
**Agent:** AI CTO Agent (ai_cto_agent)
**Session:** discovery-hub-persistence
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** medium

---

### Trigger

AGENTS.md guardrail: modifying core governance infrastructure (`src/discovery-hub.ts`) requires escalation before autonomous changes.

---

### Situation

The A2A Discovery Hub stored all registered agents in an in-memory `Map`. When the hub process stopped, all agent registrations were lost. Josh requested persistence across restarts so agents survive hub restarts.

**What was changed:**
- Added file-based persistence to `src/discovery-hub.ts`
- State file: `.asfdk-hub-state.json` (configurable via `ASFDK_HUB_STATE_FILE` env var)
- `saveState()` called on every register, deregister, and message-routing lastSeen update
- `loadState()` called on startup — reads from file if it exists
- Graceful shutdown (`SIGINT`/`SIGTERM`) saves state before exiting
- State file is JSON-serialized `{ agents: [...], stats: {...} }`

**Not changed:**
- No new dependencies added
- No changes to MCP tools, REST endpoints, or A2A protocol behavior
- No changes to the Cloudflare Workers deployment path (`src/server.ts`)
- State file is `.gitignore`-able (local runtime data)

---

### Decision Required

Approval to merge this change into the repository. The change is local-dev scope only (the hub runs as a standalone Node process via `tsx`), not affecting the Workers deployment.

---

### Options Considered

1. **File-based JSON persistence (implemented)**
   - Description: Write agents + stats to a JSON file on every mutation, load on startup
   - Trade-offs: Simple, zero dependencies, atomic writes not guaranteed (acceptable for registry use case), file grows linearly with agent count

2. **SQLite persistence**
   - Description: Use better-sqlite3 or similar for structured storage
   - Trade-offs: More robust, adds a native dependency, overkill for a registry of <100 agents

3. **Cloudflare KV (for Workers path)**
   - Description: Use KV bindings for the deployed Workers version
   - Trade-offs: Only works in CF runtime, not local dev hub

---

### Recommendation

Option 1 (implemented) is the right fit. The discovery hub is a local dev coordination tool — a JSON file is proportional to the problem. If the hub ever needs to scale or run in the Workers path, KV is the natural next step.

---

### Blockers

None — Josh's approval to merge is the only remaining step.

---

### Resolution

*(To be filled in after Joshua responds)*

**Date resolved:**
**Decision:**
**Decided by:**
**Actions taken:**
