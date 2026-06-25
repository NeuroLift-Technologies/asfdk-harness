---
description: Log intent BEFORE a significant or irreversible action per OTOI §7
argument-hint: "<brief topic, e.g. 'refactor auth module'>"
---

Write an intent log entry per ORG-DEV-OTOI-1.0.2 Section 7 **BEFORE** taking the action.

**Topic:** $ARGUMENTS

## When to Log Intent

A significant action is one that is:

- **Broad scope** — affects many files, services, or people
- **Irreversible** — difficult or impossible to undo (deletes, migrations, force-pushes)
- **Architectural** — changes how systems are structured or interact
- **Sensitive** — involves credentials, access controls, or PII

When in doubt, log it. Intent logging costs little and protects everyone.

## Steps

1. Use the format in `templates/intent-log.md` (or `.claude/skills/nlt-intent-log/SKILL.md`).

2. Fill in the entry:
   - **Date** (ISO 8601 with time, UTC)
   - **Agent**: Claude Code
   - **Session**: current branch
   - **OTOI Version**: ORG-DEV-OTOI-1.0.2
   - **Working repo**: `<org>/<repo>`
   - **Action** — exactly what you intend to do (files, functions, services involved)
   - **Rationale** — why this is the right action
   - **Risks** — what could go wrong
   - **Alternatives Considered** — at least one alternative and why not chosen
   - **Escalation Needed** — `yes` or `no`

3. **If Escalation Needed is `yes`:** STOP. Use `/escalate <topic>` before proceeding with any action.

4. If `no`: write the entry to:
   ```
   docs/agent-log/intent/<YYYY-MM-DD>-<topic-slug>.md
   ```
   Create the directory if it does not exist.

5. Commit the intent log:
   ```
   [Claude] docs(intent): log <topic> intent (ORG-DEV-OTOI-1.0.2)
   ```

6. Proceed with the action.

7. After the action completes, return to the intent log and fill in the **Outcome** section (Result, Deviations from plan).

8. Commit the outcome update:
   ```
   [Claude] docs(intent): record outcome of <topic> (ORG-DEV-OTOI-1.0.2)
   ```
