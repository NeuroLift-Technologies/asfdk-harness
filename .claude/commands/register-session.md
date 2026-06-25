---
description: File an agent self-registration record per OTOI §3
argument-hint: "[optional: session-id, defaults to current branch]"
---

Create an agent self-registration record per ORG-DEV-OTOI-1.0.2 Section 3.

**Session ID:** $ARGUMENTS (if empty, use the current git branch name)

## Steps

1. Determine values:
   - `agent_name`: Claude Code (with model identifier if known)
   - `platform`: Claude Code
   - `version`: model identifier
   - `session_id`: $ARGUMENTS or current branch (`git rev-parse --abbrev-ref HEAD`)
   - `entry_date`: today, ISO 8601 (`date -u +%Y-%m-%d`)
   - `entry_point`: brief description of the task that started this session
   - `acknowledged_otoi`: `true`
   - `otoi_version`: `ORG-DEV-OTOI-1.0.2`
   - `working_repo`: `<org>/<repo>` from git remote
   - `working_branch`: current branch
   - `capabilities_self_reported`: array of capabilities relevant to the task
   - `known_limitations`: array of known limitations relevant to the task
   - `preferred_handoff_format`: short description

2. Use the schema from `templates/agent-registration.json` if it exists, else from `.claude/skills/nlt-agent-registration/SKILL.md`.

3. Write the completed JSON to:
   ```
   docs/agent-log/registrations/<YYYY-MM-DD>-claude-code.json
   ```
   Create the `docs/agent-log/registrations/` directory if it does not exist.

4. Commit with:
   ```
   [Claude] chore(governance): register Claude Code session (ORG-DEV-OTOI-1.0.2)
   ```

5. Report back: the path of the written file and a one-sentence summary of what was registered.

## Validation

Before committing, verify:
- `otoi_version` is exactly `ORG-DEV-OTOI-1.0.2`
- `acknowledged_otoi` is `true`
- `entry_date` is ISO 8601 (YYYY-MM-DD)
- `working_repo` matches the actual remote
