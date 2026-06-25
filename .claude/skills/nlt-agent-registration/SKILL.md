---
name: nlt-agent-registration
description: 'Complete an NLT agent self-registration record (OTOI Section 3). Use when an agent is starting a new session and needs to register, when asked to fill out agent-registration.json, when logging agent session start details, or when recording agent capabilities and limitations before beginning work.'
nlt-otoi-version: ORG-DEV-OTOI-1.0.2
nlt-solidarity-framework: true
nlt-haief: true
nlt-authority: Joshua W. Dorsey, Sr.
---

# NLT Agent Self-Registration (OTOI Section 3)

This skill guides agents through completing the **agent self-registration** record required
by ORG-DEV-OTOI-1.0.2 Section 3 at the start of every NLT session.

This skill operates under NeuroLift Technologies' ORG-DEV-OTOI-1.0.2 governance contract
and Solidarity Framework principles.

## When to Use This Skill

- Starting a new session in any NLT repository
- Filling in `templates/agent-registration.json` for a session
- Recording your agent capabilities and known limitations
- Logging where to store the completed registration

## Where to Store the Registration

Save the completed registration to:
```
docs/agent-log/registrations/[date]-[agent-name].json
```

Example: `docs/agent-log/registrations/2026-04-28-claude-code.json`

The `/register-session` slash command automates this.

## Registration Template

```json
{
  "agent_registration": {
    "agent_name":         "[Your name / platform identifier]",
    "platform":           "[e.g. Codex CLI, Claude Code, Cursor, Gemini CLI, GitHub Copilot]",
    "version":            "[Model or tool version, if known]",
    "session_id":         "[Unique session identifier, if applicable]",
    "entry_date":         "[ISO 8601 date, e.g. 2026-04-28]",
    "entry_point":        "[Which file, task, or conversation brought you in]",
    "acknowledged_otoi":  true,
    "otoi_version":       "ORG-DEV-OTOI-1.0.2",
    "working_repo":       "[e.g. NeuroLift-Technologies/some-repo]",
    "working_branch":     "[e.g. feature/my-feature]",
    "capabilities_self_reported": [
      "[List your relevant capabilities]"
    ],
    "known_limitations": [
      "[List known limitations relevant to this task]"
    ],
    "preferred_handoff_format": "[Describe how you prefer to receive context]"
  }
}
```

## Field Guidance

| Field | Required | Notes |
|-------|----------|-------|
| `agent_name` | yes | Your agent name or model identifier |
| `platform` | yes | Tool platform (GitHub Copilot, Claude Code, Codex CLI, etc.) |
| `version` | Optional | Model version if known |
| `session_id` | Optional | Branch name works well as a session identifier |
| `entry_date` | yes | ISO 8601 date: `YYYY-MM-DD` |
| `entry_point` | yes | What task/issue/conversation initiated this session |
| `acknowledged_otoi` | yes | Must be `true` — confirms you have read the contract |
| `otoi_version` | yes | Must be `"ORG-DEV-OTOI-1.0.2"` |
| `working_repo` | yes | Full repo name: `NeuroLift-Technologies/repo-name` |
| `working_branch` | yes | Git branch you are working on |
| `capabilities_self_reported` | yes | List capabilities relevant to this task |
| `known_limitations` | yes | List known limitations relevant to this task |
| `preferred_handoff_format` | Optional | How you prefer to receive context from handoffs |

## Governance Commitments

When using this skill, always:

- **Escalate architectural decisions** to Joshua W. Dorsey, Sr.
- **Maintain minimal footprint** — only take actions explicitly requested
- **No credential storage** — never suggest storing secrets in code or version control
- **Transparency** — log intent before significant actions
- **Human flourishing** — every recommendation should serve the team and mission

## References

- `templates/agent-registration.json` — Blank registration template
- `NLT-DEV-OTOI.md` Section 3 — Canonical self-registration spec
- `SOPs/new-agent-onboarding.md` — Full onboarding procedure
