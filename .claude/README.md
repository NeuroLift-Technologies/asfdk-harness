# `.claude/` — Canonical Claude Code Governance Template

**Repository:** `NeuroLift-Technologies/.github-private`
**Governed by:** ORG-DEV-OTOI-1.0.2 | Solidarity Framework | HAIEF
**Authority:** Joshua W. Dorsey, Sr.

---

## Purpose

This directory is the **canonical Claude Code session configuration** for every NeuroLift Technologies repository. Its contents are synced into product repos by `.github/workflows/governance-auto-propagate.yml` (SOP-NLT-002).

When a Claude Code session starts in any NLT repo with a synced copy of this directory:

1. The `SessionStart` hook in `settings.json` runs `hooks/session-start.sh`, which prints the OTOI mandatory reading order and verifies governance file presence.
2. Subagents in `agents/` are available via Claude Code's subagent dispatch.
3. Skills in `skills/` are loadable on demand.
4. Slash commands in `commands/` (`/register-session`, `/handoff`, `/escalate`, `/intent-log`, `/governance-check`) wrap the existing `templates/` artifacts and OTOI workflows.

---

## Layout

```
.claude/
├── README.md                 # This file
├── settings.json             # SessionStart hook wiring, permissions, env
├── hooks/
│   ├── session-start.sh      # Prints OTOI reading order + validates required files
│   └── README.md
├── agents/                   # Curated Claude Code subagents (NLT frontmatter)
│   ├── nlt-governance-steward.md
│   ├── nlt-code-reviewer.md
│   └── swe-agent.md
├── skills/                   # Skills (1:1 with /skills/ canonical catalog)
│   ├── nlt-otoi/SKILL.md
│   ├── nlt-agent-registration/SKILL.md
│   ├── nlt-handoff-record/SKILL.md
│   ├── nlt-escalation/SKILL.md
│   ├── nlt-intent-log/SKILL.md
│   ├── nlt-commit-format/SKILL.md
│   └── nlt-incident-response/SKILL.md
└── commands/                 # Slash commands for governance actions
    ├── register-session.md   # OTOI §3 — agent self-registration
    ├── handoff.md            # OTOI §5 — session handoff record
    ├── escalate.md           # OTOI §4.3 — escalation to Joshua W. Dorsey, Sr.
    ├── intent-log.md         # OTOI §7 — intent before significant action
    └── governance-check.md   # Run validate-governance.sh
```

---

## Editing Policy

**Edit upstream, not the downstream copies.**

This directory is the source of truth. Edits to `.claude/` in product repos (`neurolift-ai-fusion`, etc.) are overwritten by the next propagation run. To change session governance org-wide:

1. Open a PR against this directory in `.github-private`.
2. Once merged, the next `governance-auto-propagate.yml` run (nightly 05:00 UTC, or manual `workflow_dispatch`) syncs the change to every product repo as a PR.

The one exception: each repo may keep a local `.claude/settings.local.json` for repo-specific overrides — the propagation workflow never overwrites that file.

---

## Why This Layer Exists

Before `.claude/`, agent compliance with ORG-DEV-OTOI-1.0.2 depended on agents voluntarily reading `CLAUDE.md`. With `.claude/`:

- The `SessionStart` hook **prints** the reading order at session start — agents see it whether or not they navigate to `CLAUDE.md` first.
- Slash commands lower the friction of doing the governance-correct thing (`/handoff` beats remembering the JSON schema).
- The validation script can verify session-level scaffolding is present, not just docs.

It does not replace `CLAUDE.md`, `AGENTS.md`, or `NLT-DEV-OTOI.md` — it operationalizes them.

---

*NeuroLift Technologies — Internal Governance | ORG-DEV-OTOI-1.0.2*
