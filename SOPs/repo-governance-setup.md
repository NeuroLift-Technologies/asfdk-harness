# SOP: Repository Governance Setup

**SOP ID:** SOP-NLT-002
**Version:** 1.1.0
**Scope:** Setting up governance stubs in a new or existing NLT repository
**Authority:** Joshua W. Dorsey, Sr.
**Governed by:** ORG-DEV-OTOI-1.0.2

---

## Purpose

This SOP defines how to add the minimum required governance artifacts to a new or existing NeuroLift Technologies repository so that coding agents — including Claude Code sessions — can operate correctly within it.

---

## When to Use This SOP

- Creating a new NLT repository
- Adding governance to an existing NLT repository that lacks it
- Auditing a repo for governance compliance
- Adding Claude Code session-level governance to an existing repo

---

## Minimum Required Files per Repo

Each NLT repo should have:

| File / Directory | Purpose |
|---|---|
| `CLAUDE.md` | Agent session directive — points to org-level OTOI |
| `docs/active-threads.md` | Current work state tracker |
| `docs/agent-log/` | Directory for agent registration and handoff records |
| `.claude/` | Claude Code session configuration (synced from `.github-private` once the `governance-auto-propagate.yml` workflow extension is applied) |

---

## Step-by-Step Procedure

### Step 1: Create `CLAUDE.md`

Create `CLAUDE.md` at the repository root using the following template:

```markdown
# CLAUDE.md — [REPO NAME]

You are working in a NeuroLift Technologies repository.

**Mandatory reading (in order):**
1. Org-level governance (private, primary):
   https://github.com/NeuroLift-Technologies/.github-private/blob/main/NLT-DEV-OTOI.md
   Public mirror (if the link above returns 404):
   https://github.com/NeuroLift-Technologies/.github/blob/main/governance/NLT-DEV-OTOI.md
2. Internal gateway (private, primary):
   https://github.com/NeuroLift-Technologies/.github-private/blob/main/AGENTS.md
   Public mirror (if the link above returns 404):
   https://github.com/NeuroLift-Technologies/.github/blob/main/governance/AGENTS.md
3. Project context: `docs/context/README_TO_AI.md` (this repo, if present)
4. Active threads: `docs/active-threads.md` (this repo)

**Non-negotiable:** Joshua W. Dorsey, Sr. is final authority on all architectural,
deployment, UX, and strategic decisions. Escalate. Do not guess.

**Governed by:** Solidarity Framework | HAIEF | https://elevaitionfoundation.org
**OTOI Version:** ORG-DEV-OTOI-1.0.2
```

Replace `[REPO NAME]` with the actual repository name. Add any project-specific context (build commands, gotchas, code paths) below the mandatory reading section.

### Step 2: Create `docs/active-threads.md`

```markdown
# Active Threads — [REPO NAME]

> This file tracks active work threads. Agents must read this at session start and update it during and at the end of each session.

**Last updated:** [ISO 8601 date]

---

## Active Threads

*(No active threads yet)*

---

## Resolved Threads

*(None yet)*
```

### Step 3: Create `docs/agent-log/` Directory Structure

```
docs/
└── agent-log/
    ├── README.md
    ├── registrations/     ← Agent self-registrations
    └── handoffs/          ← Handoff records between sessions
```

`docs/agent-log/README.md` content:

```markdown
# Agent Log

This directory contains agent registration records and session handoff documents.

- `registrations/` — Agent self-registration files (one per session start)
- `handoffs/` — Session handoff records (written at session end)

Format reference: `NeuroLift-Technologies/.github-private` templates directory.
```

### Step 4: (Optional) Create `docs/escalations/` Directory

```
docs/
└── escalations/
    └── README.md
```

### Step 5: Grant GitHub App Access to `.github-private`

Coding agents must be able to read the governance files in `.github-private`. If the GitHub App is scoped to "Selected repositories":

1. Go to `https://github.com/organizations/NeuroLift-Technologies/settings/installations`
2. Find the GitHub App used by agents (Copilot, Codex, Claude Code) and click **Configure**.
3. Under **Repository access → Selected repositories**, add **`.github-private`**.
4. Click **Save**.

> Fallback: The public mirror URLs in the `CLAUDE.md` template above work if access cannot be granted immediately. See `docs/troubleshooting/github-app-access.md` in `.github-private`.

### Step 6: Commit the Governance Setup

Commit using the format:

```
[AGENT_NAME] chore(governance): add repo governance stubs (ORG-DEV-OTOI-1.0.2)
```

### Step 7: Verify

Confirm the following exist and contain correct content:
- [ ] `CLAUDE.md` references `NLT-DEV-OTOI` and `ORG-DEV-OTOI-1.0.2`
- [ ] `docs/active-threads.md` exists and is readable
- [ ] `docs/agent-log/` directory structure created
- [ ] GitHub App has access to `.github-private` (or public mirror fallback is in place)

### Step 8: Provision the `.claude/` Template

The `.claude/` directory holds the canonical Claude Code session configuration: `settings.json`, the SessionStart hook, subagents, skills, and slash commands.

> **Current automation state.** As of SOP-NLT-002 v1.1.0, the live `governance-auto-propagate.yml` workflow in `.github-private` syncs `CLAUDE.md`, `docs/active-threads.md`, `docs/agent-log/README.md`, and the canonical `.claude/` template. Repo-specific overrides still belong in `.claude/settings.local.json`, which the workflow never overwrites.

**A. Automated.** The nightly `governance-auto-propagate.yml` run (05:00 UTC) opens a PR in each affected repo combined with any other governance stub remediation. Title pattern: `[GOVERNANCE] Add mandatory NLT governance stubs (ORG-DEV-OTOI-1.0.2)`. The PR body lists the `.claude/` files synced. Review and merge.

```bash
# Manual trigger (from .github-private repo, only useful after the extension is applied)
gh workflow run governance-auto-propagate.yml -R NeuroLift-Technologies/.github-private
```

**B. Manual (works today).** Copy the entire `.claude/` directory from `NeuroLift-Technologies/.github-private` at `main`:

```
.claude/
├── README.md
├── settings.json
├── hooks/
│   ├── session-start.sh
│   └── README.md
├── agents/
├── skills/
└── commands/
```

Verify:
- [ ] `.claude/settings.json` contains the `SessionStart` hook wiring
- [ ] `.claude/hooks/session-start.sh` is executable (`chmod +x` if filesystem-tracked)
- [ ] Starting a Claude Code session prints the OTOI reading order and a list of governance file presence checks

**Do not edit `.claude/` files in this repo** — they are overwritten by the next propagation run (once the extension is applied). For repo-specific session overrides, create `.claude/settings.local.json` (which the propagation workflow never overwrites).

---

## Validation

Run the org-level validation script to check `.github-private` is healthy:

```bash
git clone https://github.com/NeuroLift-Technologies/.github-private
cd .github-private
bash .nltotoi/scripts/validate-governance.sh
```

For a product repo, the same script can be run locally if `.nltotoi/` is provisioned, or the CI workflow `validate-governance.yml` enforces the same checks on every push and PR.

---

*SOP-NLT-002 v1.1.0 | NeuroLift Technologies | ORG-DEV-OTOI-1.0.2*
