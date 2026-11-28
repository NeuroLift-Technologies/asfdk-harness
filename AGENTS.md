# AGENTS.md — NeuroLift Technologies / asfdk-harness

> Internal agent coordination gateway for this repository. Canonical organization governance remains `NLT-DEV-OTOI.md` / `ORG-DEV-OTOI-1.0.4`.

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

## Pull requests and tests

1. Read `PULL_REQUEST_TEMPLATE/agent-contribution.md` and use it for every agent PR, including drafts. Fill in the metadata and all sections. Leave unverified checklist items unchecked and explain why.
2. Run `npm test` for the branch and record the results in the template. Generate Worker types first with `npm run cf:typegen` if they are missing.
3. Run `npm run test:pr-template -- <pr-body.md>` on the completed body before opening or editing the PR. Submit the validated body and verify the published PR retains the template.

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

Governed by Solidarity Framework | HAIEF | ORG-DEV-OTOI-1.0.4
