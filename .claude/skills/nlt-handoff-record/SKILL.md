---
name: nlt-handoff-record
description: 'Write a complete NLT session handoff record (OTOI Section 5). Use when ending a coding session, when asked to write a handoff, create a handoff record, document session end, or prepare work for the next agent. Covers work completed, work in progress, blockers, decisions, escalations, and next agent notes.'
nlt-otoi-version: ORG-DEV-OTOI-1.0.2
nlt-solidarity-framework: true
nlt-haief: true
nlt-authority: Joshua W. Dorsey, Sr.
---

# NLT Session Handoff Record (OTOI Section 5)

This skill guides agents through writing a complete **session handoff record** as required
by ORG-DEV-OTOI-1.0.2 Section 5. A handoff record must be written at the end of every
significant session.

This skill operates under NeuroLift Technologies' ORG-DEV-OTOI-1.0.2 governance contract
and Solidarity Framework principles.

## When to Use This Skill

- Ending any significant coding session in an NLT repository
- Preparing work so the next agent can pick up seamlessly
- Documenting completed work, in-progress items, and blockers
- Recording decisions made and decisions still pending

## Where to Store the Handoff

Save the completed handoff to:
```
docs/agent-log/handoffs/[date]-[session-id].json
```

Example: `docs/agent-log/handoffs/2026-04-28-feature-auth.json`

The `/handoff` slash command automates this.

## Handoff Record Template

```json
{
  "handoff_record": {
    "session_id":         "[Unique session identifier]",
    "agent_name":         "[Agent name / platform]",
    "date":               "[ISO 8601 date, e.g. 2026-04-28]",
    "otoi_version":       "ORG-DEV-OTOI-1.0.2",
    "repo":               "[Repository worked in, e.g. NeuroLift-Technologies/some-repo]",
    "branch":             "[Branch name]",
    "work_completed": [
      "[Describe completed work item 1]"
    ],
    "work_in_progress": [],
    "blockers": [],
    "decisions_made": [],
    "decisions_pending": [],
    "escalations": [],
    "next_agent_notes": "[What the next agent needs to know to pick up this work]",
    "files_modified": [],
    "tests_run": [],
    "tests_passing": true,
    "pr_url": "[URL of the pull request, if applicable]"
  }
}
```

## Field Guidance

All fields required; use empty arrays where there is no content rather than omitting fields.

| Field | Notes |
|-------|-------|
| `session_id` | Branch name or unique identifier for this session |
| `agent_name` | Your agent name/platform (e.g. "Claude Code") |
| `date` | ISO 8601 date: `YYYY-MM-DD` |
| `otoi_version` | Must be `"ORG-DEV-OTOI-1.0.2"` |
| `repo` | Full repo name: `NeuroLift-Technologies/repo-name` |
| `branch` | Git branch you worked on |
| `work_completed` | Specific, concrete list of completed items |
| `work_in_progress` | Items started but not finished |
| `blockers` | Any conditions blocking progress |
| `decisions_made` | Key decisions with rationale |
| `decisions_pending` | Decisions still needed and who must make them |
| `escalations` | Any escalations raised and their current status |
| `next_agent_notes` | The most important context for the next agent |
| `files_modified` | Complete list of changed files |
| `tests_run` | Tests executed |
| `tests_passing` | Boolean: `true` if all tests pass; do not assert true if tests were not run |
| `pr_url` | Pull request URL if one was created |

## Session-End Checklist

Before writing the handoff record, complete:

- [ ] Update `docs/active-threads.md` with current thread state
- [ ] Document any open escalations in `docs/escalations/`
- [ ] Ensure all changes are committed and pushed
- [ ] Record the PR URL if a pull request was created

## Governance Commitments

When using this skill, always:

- **Escalate architectural decisions** to Joshua W. Dorsey, Sr.
- **Maintain minimal footprint** — only take actions explicitly requested
- **No credential storage** — never suggest storing secrets in code or version control
- **Transparency** — log intent before significant actions
- **Human flourishing** — every recommendation should serve the team and mission

## References

- `templates/handoff-record.json` — Blank handoff template
- `NLT-DEV-OTOI.md` Section 5 — Canonical handoff protocol spec
- `SOPs/new-agent-onboarding.md` — Full onboarding/session-end SOP
