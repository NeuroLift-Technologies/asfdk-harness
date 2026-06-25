# CLAUDE.md — asfdk-harness

<!-- NLT Governance Preamble -->
> You are working in a NeuroLift Technologies repository.
>
> **Mandatory reading (in order):**
> 1. Org-level governance: `NLT-DEV-OTOI.md`
>    Private canonical source: https://github.com/NeuroLift-Technologies/.github-private/blob/main/NLT-DEV-OTOI.md
>    Public mirror (if private link returns 404):
>    https://github.com/NeuroLift-Technologies/.github/blob/main/governance/NLT-DEV-OTOI.md
> 2. Internal gateway: `AGENTS.md`
> 3. Active threads: `docs/active-threads.md`
>
> **Non-negotiable:** Joshua W. Dorsey, Sr. is final authority on all architectural,
> deployment, UX, and strategic decisions. Escalate. Do not guess.
>
> **Governed by:** Solidarity Framework | HAIEF | https://elevaitionfoundation.org
> **OTOI Version:** ORG-DEV-OTOI-1.0.2

---

## Repository purpose

`asfdk-harness` creates an agent harness on top of Pi for `@neurolift-technologies/asfdk`.

It currently provides both:

1. A Pi package / extension (`src/index.ts`) that registers ASFDK tools and governance hooks.
2. A standalone Pi SDK one-shot runner (`src/cli.ts`).

## Development commands

```bash
npm install
npm run check
npm run build
npm run harness -- "What files are in this repo?"
```

## Key paths

| Path | Purpose |
|---|---|
| `src/index.ts` | Pi extension entrypoint |
| `src/harness.ts` | ASFDK foundation wrapper |
| `src/tools.ts` | Pi tools exposed by the harness |
| `src/policy.ts` | Local tool-call policy checks |
| `src/cli.ts` | Standalone Pi SDK runner |
| `skills/asfdk-harness/SKILL.md` | Pi skill for ASFDK harness behavior |
| `prompts/asfdk-harness.md` | Pi prompt template |
| `.claude/` | Canonical Claude Code governance template copied from `.github-private` |

## Governance notes

- Do not edit `NLT-DEV-OTOI.md` without Joshua's explicit approval and the formal amendment process.
- `.claude/` is copied from `.github-private`; upstream changes may overwrite downstream copies.
- Avoid touching `.github/workflows/*` unless the local GitHub token has `workflow` scope.
