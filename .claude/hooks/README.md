# `.claude/hooks/` — Session Lifecycle Hooks

**Governed by:** ORG-DEV-OTOI-1.0.2

---

## Files

| File | Lifecycle event | Purpose |
|---|---|---|
| `session-start.sh` | `SessionStart` (startup, resume, clear, compact) | Prints OTOI mandatory reading order and verifies governance file presence. Always exits 0. |

---

## Wiring

Hooks are wired in `.claude/settings.json` under `hooks.SessionStart`. The matcher `"*"` runs the hook on every session-start event (initial startup, resume, /clear, and post-compact).

---

## Modifying Hooks

This hook is part of the canonical template. Changes go through `.github-private` and propagate via `governance-auto-propagate.yml`. Do not edit the synced copy in a product repo — it will be overwritten on the next propagation run.

For repo-specific additions (e.g., a project-specific test runner check), add them to `.claude/settings.local.json` in the consuming repo — the propagation workflow never overwrites that file.

---

*NeuroLift Technologies — Internal Governance | ORG-DEV-OTOI-1.0.2*
