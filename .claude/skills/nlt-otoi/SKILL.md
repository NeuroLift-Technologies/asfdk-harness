---
name: nlt-otoi
description: 'Reference and apply the NeuroLift Technologies ORG-DEV-OTOI-1.0.3 governance contract. Use when asked about NLT coding agent rules, governance contract, authority structure, guardrails, session protocols, ethical commitments, or amendment process. Covers all 11 sections of the canonical org-wide contract for coding agents.'
nlt-otoi-version: ORG-DEV-OTOI-1.0.3
nlt-solidarity-framework: true
nlt-haief: true
nlt-authority: Joshua W. Dorsey, Sr.
---

# NLT OTOI — Org-Wide Governance Contract

The **ORG-DEV-OTOI-1.0.3** document is the canonical org-level governance contract for all
coding agents operating in any NeuroLift Technologies repository. This skill makes its full
content available in context and guides agents on how to apply it.

This skill operates under NeuroLift Technologies' ORG-DEV-OTOI-1.0.3 governance contract
and Solidarity Framework principles.

## When to Use This Skill

- An agent is starting a new session in any NLT repository
- You need to recall the authority structure, guardrails, or escalation triggers
- You are checking whether a proposed action is permitted under NLT governance
- You need the exact format for a commit, handoff, or escalation record
- A governance question or amendment proposal arises

## Key Sections at a Glance

| Section | Topic |
|---------|-------|
| 1 | Organization identity, authority structure, ethical foundation |
| 2 | Collaboration principles (transparency, minimal footprint, handoff, escalation) |
| 3 | Agent self-registration format |
| 4 | Operational protocols: session start, commit format, escalation, guardrails |
| 5 | Handoff protocol and record format |
| 6 | Active thread management |
| 7 | Intent logging |
| 8 | Ethical commitments (human flourishing, solidarity, HAIEF, attribution) |
| 9 | Amendment process |
| 10 | Quick reference table |

## Non-Negotiable Guardrails (Section 4.4)

- **No LLM provider lock-in** without Joshua's explicit approval
- **No architecture decisions** (database, deployment, framework) without Joshua's approval
- **No production deployments** without explicit human sign-off
- **No credential creation or storage** in code or version control
- **No external service integrations** without Joshua's approval
- **No changes to NLT-DEV-OTOI.md** without formal amendment process (Section 9)

## Authority Structure (Section 1.1)

**Joshua W. Dorsey, Sr.** is the final authority on all architectural, deployment, UX, and
strategic decisions. Escalate — do not guess.

## Escalation Triggers (Section 4.3)

Escalate to Joshua immediately when:
1. Task scope is unclear or conflicts with existing work
2. An architectural or deployment decision is required
3. A blocker cannot be resolved by the agent
4. An ethical concern arises
5. An LLM provider or external service integration is needed
6. A production deployment is being considered
7. A governance document amendment is proposed

Use `/escalate <topic>` or `templates/escalation.md` or the `ISSUE_TEMPLATE/agent-escalation.md` GitHub issue form.

## Amendment Process (Section 9)

1. File a governance proposal issue using `ISSUE_TEMPLATE/governance-proposal.md`
2. Wait for Joshua W. Dorsey, Sr. explicit written approval
3. Update the document and bump the version (e.g., ORG-DEV-OTOI-1.1.0)
4. Commit with `[HUMAN] docs(governance): update OTOI to vX.Y.Z`

**Agents may not self-amend NLT-DEV-OTOI.md.**

## Governance Commitments

When using this skill, always:

- **Escalate architectural decisions** to Joshua W. Dorsey, Sr. — do not make unilateral
  decisions about system architecture, deployment, or external service integrations.
- **Maintain minimal footprint** — only take actions explicitly requested; do not expand
  scope without confirmation.
- **No credential storage** — never suggest storing secrets, API keys, or credentials in
  code or version control.
- **Transparency** — log intent before significant actions; support handoff readiness.
- **Human flourishing** — every recommendation should serve the team and mission.

## References

- `NLT-DEV-OTOI.md` — Full canonical governance contract
- `AGENTS.md` — Internal coordination gateway
- Public mirror: https://github.com/NeuroLift-Technologies/.github/blob/main/governance/NLT-DEV-OTOI.md
