# AGENTS.md — NeuroLift Technologies / asfdk-harness

> Internal agent coordination gateway for this repository. Canonical organization governance remains `NLT-DEV-OTOI.md` / `ORG-DEV-OTOI-1.0.2`.

## Mandatory reading order

1. `NLT-DEV-OTOI.md` — org-level coding agent contract
2. `CLAUDE.md` — repo-specific project context
3. `docs/active-threads.md` — current work state
4. Self-register in `docs/agent-log/registrations/`

Final authority: **Joshua W. Dorsey, Sr.** Escalate; do not guess.

## Commit format

```text
[AGENT_NAME] type(scope): description
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `ci`.

All agent-authored work must go through a feature branch and Pull Request. Never push directly to `main` or protected branches.

## Guardrails

- No LLM provider lock-in.
- No autonomous architecture, database, deployment, UX, or strategic decisions.
- No production deployments without explicit human approval.
- No credentials, secrets, or tokens in code or VCS.
- No new external integrations without approval.
- No self-amending `NLT-DEV-OTOI.md`.

## Repository context

`asfdk-harness` is the ASFDK Solidarity Framework runtime/control plane for `@neurolift-technologies/asfdk`. Pi is the first supported cofounder-agent runtime.

- Runtime extension entrypoint (Pi = first supported): `src/index.ts`
- Standalone CLI: `src/cli.ts`
- ASFDK wrapper: `src/harness.ts`
- Pi skills/prompts: `skills/`, `prompts/`
- Canonical Claude Code governance template copied from `.github-private`: `.claude/`

## Handoff protocol

Before ending significant work:

1. Update `docs/active-threads.md`.
2. Write a handoff record in `docs/agent-log/handoffs/`.
3. Record escalations in `docs/escalations/` if any.

Governed by Solidarity Framework | HAIEF | ORG-DEV-OTOI-1.0.2
