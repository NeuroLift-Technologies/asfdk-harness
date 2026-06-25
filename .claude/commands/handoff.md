---
description: Write a complete NLT session handoff record per OTOI §5
---

Write a complete session handoff record per ORG-DEV-OTOI-1.0.2 Section 5.

## Steps

1. Determine session context:
   - `session_id`: current branch (`git rev-parse --abbrev-ref HEAD`)
   - `agent_name`: Claude Code
   - `date`: today, ISO 8601
   - `otoi_version`: `ORG-DEV-OTOI-1.0.2`
   - `repo`: `<org>/<repo>` from git remote
   - `branch`: current branch

2. Summarize this session honestly:
   - `work_completed`: concrete, specific list (not aspirational)
   - `work_in_progress`: items started but not finished (empty array if none)
   - `blockers`: anything blocking progress (empty array if none)
   - `decisions_made`: key decisions with rationale
   - `decisions_pending`: decisions still needed and who must make them
   - `escalations`: any escalations raised and their status
   - `next_agent_notes`: the most important context for the next agent
   - `files_modified`: complete list of changed files
   - `tests_run`: tests executed (empty array if none)
   - `tests_passing`: boolean
   - `pr_url`: pull request URL if one was created

3. Schema reference: `templates/handoff-record.json` or `.claude/skills/nlt-handoff-record/SKILL.md`.

4. Write the completed JSON to:
   ```
   docs/agent-log/handoffs/<YYYY-MM-DD>-<session-id>.json
   ```
   Create the directory if it does not exist.

5. Before committing, update `docs/active-threads.md` to reflect the current state of this thread.

6. Commit with:
   ```
   [Claude] chore(governance): add session handoff record (ORG-DEV-OTOI-1.0.2)
   ```

7. Report back: the path of the written file and a one-sentence summary.

## Validation

Before committing, verify:
- `otoi_version` is exactly `ORG-DEV-OTOI-1.0.2`
- `work_completed` is honest and concrete
- `tests_passing` reflects reality (do not assert true if tests were not run)
- `files_modified` matches the actual diff
