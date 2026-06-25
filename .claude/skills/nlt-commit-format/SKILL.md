---
name: nlt-commit-format
description: 'Format NLT agent commit messages correctly (OTOI Section 4.2). Use when writing a commit message, when asked about the NLT commit format, when a commit is flagged as non-compliant, or when preparing to commit changes in any NeuroLift Technologies repository. Enforces [AGENT_NAME] type(scope): description format.'
nlt-otoi-version: ORG-DEV-OTOI-1.0.2
nlt-solidarity-framework: true
nlt-haief: true
nlt-authority: Joshua W. Dorsey, Sr.
---

# NLT Commit Message Format (OTOI Section 4.2)

This skill ensures agents write commit messages that comply with the NLT commit format
standard defined in ORG-DEV-OTOI-1.0.2 Section 4.2 and validated by
`.github/workflows/agent-commit-format.yml`.

This skill operates under NeuroLift Technologies' ORG-DEV-OTOI-1.0.2 governance contract
and Solidarity Framework principles.

## When to Use This Skill

- Writing any commit in an NLT repository
- A CI check has flagged a commit as non-compliant
- Reviewing or correcting another agent's commit messages
- Preparing a commit before pushing or opening a PR

## Commit Format

```
[AGENT_NAME] type(scope): description
```

## Fields

| Field | Description | Example |
|-------|-------------|---------|
| `AGENT_NAME` | Your agent name or platform (no spaces, use hyphens if needed) | `Claude`, `Copilot`, `Codex` |
| `type` | Change type — must be one of the allowed types | `feat` |
| `scope` | Area of the codebase affected (short noun phrase) | `handoff-template` |
| `description` | Imperative-mood summary; no trailing period | `add session end protocol fields` |

## Allowed Types

| Type | When to use |
|------|------------|
| `feat` | New feature or file added |
| `fix` | Bug fix or correction |
| `docs` | Documentation-only change |
| `refactor` | Refactor without behavior change |
| `chore` | Maintenance, cleanup, config |
| `test` | Adding or updating tests |
| `ci` | CI workflow changes |

## Valid Examples

```
[Claude] feat(claude-template): add .claude/ canonical template
[Claude] fix(validate-governance): correct workflow path in required-files list
[Codex] docs(sop-001): clarify step 7 commit format requirements
[Claude] ci(agent-commit-format): extend pattern to allow bot suffix in agent name
[Copilot] chore(governance): add repo governance stubs (ORG-DEV-OTOI-1.0.2)
```

## Common Mistakes

| Wrong | Right | Why |
|-------|-------|-----|
| `feat: add template` | `[Claude] feat(scope): add template` | Missing `[AGENT_NAME]` |
| `[Claude] added template` | `[Claude] feat(templates): add template` | Missing type and scope |
| `[Claude] feat(templates): Added template.` | `[Claude] feat(templates): add template` | Past tense; trailing period |
| `[Claude] update(templates): ...` | `[Claude] chore(templates): ...` | `update` is not an allowed type |
| `[My Agent Name] feat(x): y` | `[My-Agent-Name] feat(x): y` | No spaces in AGENT_NAME |

## Fork Repository Exception

The commit format requirement does **not** apply to pull requests from forked repositories.
Fork PR workflows are governed at the org level and can only be approved and run by
Joshua W. Dorsey, Sr. The `agent-commit-format` check is automatically skipped for fork PRs.

## Governance Commitments

- **Escalate architectural decisions** to Joshua W. Dorsey, Sr.
- **Maintain minimal footprint** — only take actions explicitly requested
- **No credential storage** — never suggest storing secrets in code or version control
- **Transparency** — log intent before significant actions
- **Human flourishing** — every recommendation should serve the team and mission

## References

- `templates/commit-message.md` — Full commit message guide
- `NLT-DEV-OTOI.md` Section 4.2 — Commit format spec
- `SOPs/new-agent-onboarding.md` — SOP-NLT-001 Step 7
