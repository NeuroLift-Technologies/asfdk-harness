---
name: nlt-incident-response
description: 'Respond to a coding agent that has gone off-rails or violated NLT governance (SOP-NLT-003). Use when an agent has made unauthorized changes, committed credentials, exceeded scope, or taken irreversible actions. Covers severity classification, immediate response steps, credential revocation, revert procedures, incident documentation, and prevention.'
nlt-otoi-version: ORG-DEV-OTOI-1.0.2
nlt-solidarity-framework: true
nlt-haief: true
nlt-authority: Joshua W. Dorsey, Sr.
---

# NLT Incident Response — Agent Off-Rails (SOP-NLT-003)

This skill guides the response when a coding agent has deviated from NLT governance
protocols per **SOP-NLT-003**. Use it immediately when an incident is detected.

This skill operates under NeuroLift Technologies' ORG-DEV-OTOI-1.0.2 governance contract
and Solidarity Framework principles.

## When to Use This Skill

- A coding agent has made unauthorized architectural decisions
- An agent committed secrets, credentials, or sensitive data
- An agent exceeded authorized scope
- An agent took irreversible actions without approval
- Behavior is inconsistent with ORG-DEV-OTOI-1.0.2

## Severity Classification

| Severity | Examples |
|----------|---------|
| **Critical** | Secrets committed, production systems modified, external systems accessed without approval |
| **High** | Unauthorized architecture decisions, scope significantly exceeded, data integrity affected |
| **Medium** | Commit format violations, missing handoff records, active-threads.md not updated |
| **Low** | Minor protocol deviations with no functional impact |

## Immediate Response (Critical / High)

### Step 1: Stop the Agent

Terminate the agent session immediately. Do not allow further commits.

### Step 2: Assess the Damage

1. What unauthorized actions were taken?
2. Are secrets or credentials exposed? → If yes, treat as security incident immediately
3. Were production systems affected?
4. What is the current state of the working branch/repo?
5. Is any data at risk?

### Step 3: Secure (If Credentials Exposed)

If any secrets, tokens, API keys, or credentials were committed:

1. **Immediately revoke** all exposed credentials — treat as compromised
2. Rotate all secrets referenced in or near the affected commits
3. Remove secrets from git history (use `git filter-branch` or BFG Repo Cleaner)
4. Force-push the cleaned branch
5. Audit all systems that used the exposed credentials

**This must happen within minutes, not hours.**

### Step 4: Revert Unauthorized Changes

```bash
# Option A: Revert specific commits
git revert [commit-sha]

# Option B: Reset branch to last known-good state
git reset --hard [last-good-sha]
git push --force-with-lease origin [branch]
```

Document what was reverted and why.

### Step 5: Document the Incident

Create an incident record at `docs/escalations/incident-[date]-[brief-description].md`.

### Step 6: Escalate to Joshua W. Dorsey, Sr.

All Critical and High severity incidents must be escalated immediately:
- File GitHub issue using `ISSUE_TEMPLATE/agent-escalation.md` (or `/escalate`)
- Contact: info@neuroliftsolutions.com
- Priority: **critical**

## Standard Response (Medium / Low)

1. Document the deviation in `docs/escalations/`
2. Fix commit messages, add missing handoff records, update `docs/active-threads.md`
3. Bring the deviation to Joshua's attention for protocol review

## Post-Incident Review

After any incident, answer:
1. What happened? (Timeline of events)
2. Why did it happen? (Root cause)
3. What was the impact?
4. What changed? (Reverted code, rotated credentials)
5. What prevents recurrence? (OTOI amendment? Better CLAUDE.md?)

File a `governance-proposal` GitHub issue if OTOI amendments are needed.

## Governance Commitments

- **Escalate architectural decisions** to Joshua W. Dorsey, Sr.
- **Maintain minimal footprint** — only take actions explicitly requested
- **No credential storage** — never suggest storing secrets in code or version control
- **Transparency** — log intent before significant actions
- **Human flourishing** — every recommendation should serve the team and mission

## References

- `SOPs/incident-response.md` — Full incident response SOP
- `NLT-DEV-OTOI.md` — Canonical org-level agent contract
- `ISSUE_TEMPLATE/agent-escalation.md` — GitHub escalation issue form
