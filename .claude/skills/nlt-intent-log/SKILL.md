---
name: nlt-intent-log
description: 'Write an NLT intent log entry before taking a significant action (OTOI Section 7). Use when about to make a broad-scope change, an irreversible action, an architectural modification, or any action that warrants transparency before execution. Captures action, rationale, risks, alternatives, and whether escalation is needed.'
nlt-otoi-version: ORG-DEV-OTOI-1.0.2
nlt-solidarity-framework: true
nlt-haief: true
nlt-authority: Joshua W. Dorsey, Sr.
---

# NLT Intent Log (OTOI Section 7)

This skill guides agents through creating an **intent log entry** as required by
ORG-DEV-OTOI-1.0.2 Section 7. Intent logging is a transparency mechanism — log your
intent before acting, then record the outcome afterward.

This skill operates under NeuroLift Technologies' ORG-DEV-OTOI-1.0.2 governance contract
and Solidarity Framework principles.

## When to Use This Skill

- Before any action with broad scope or architectural impact
- Before any irreversible action (deletes, force-pushes, schema changes)
- Before touching files outside your immediate task scope
- When you are unsure whether an action requires escalation
- When you want to demonstrate transparency before a significant change

## Where to Store the Intent Log

Save intent log entries to:
```
docs/agent-log/intent/[date]-[topic].md
```

The `/intent-log <topic>` slash command automates this.

## Decision Flowchart

```
Significant action identified?
        |
        v
Write intent log entry
        |
        v
Escalation needed? --yes--> Stop; /escalate <topic>; wait for Joshua
        |
       no
        |
        v
Proceed with action
        |
        v
Fill in Outcome section of intent log
```

## What Qualifies as "Significant"?

A significant action is one that is:
- **Broad scope** — affects many files, services, or people
- **Irreversible** — difficult or impossible to undo (deletes, migrations, force-pushes)
- **Architectural** — changes how systems are structured or interact
- **Sensitive** — involves credentials, access controls, or PII

When in doubt, log it. Intent logging costs little and protects everyone.

## Governance Commitments

- **Escalate architectural decisions** to Joshua W. Dorsey, Sr.
- **Maintain minimal footprint** — only take actions explicitly requested
- **No credential storage** — never suggest storing secrets in code or version control
- **Transparency** — log intent before significant actions
- **Human flourishing** — every recommendation should serve the team and mission

## References

- `templates/intent-log.md` — Blank intent log template
- `NLT-DEV-OTOI.md` Section 7 — Intent logging spec
- `templates/escalation.md` — Escalation template
