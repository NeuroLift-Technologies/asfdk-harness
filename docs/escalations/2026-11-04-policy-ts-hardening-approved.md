# Escalation record (approved) — policy.ts / protocols.ts / tools.ts hardening

**Date:** 2026-11-04
**Agent / session:** Claude Code, session_01UNjnjm3TZ7Tg4MRswGt24P
**Branch:** ccr-0d5033af-1rkbla
**OTOI:** ORG-DEV-OTOI-1.0.3
**Status:** Approved by the owner in the originating session; PR is a draft for owner review.

## Why this is an escalation
`src/CLAUDE.md` requires escalation and Joshua's explicit approval before changing `src/policy.ts`. Approval was given in the owning session on 2026-11-04: the owner chose "Fix upstream with a test corpus" (approving changes to `policy.ts` patterns in `asfdk-harness`) and then instructed "open a PR for the other 2" (asfdk-harness and asfdk).

## Intended action
1. `src/policy.ts`: add blocking only. Recursive `rm` of a root, home, or glob target is blocked regardless of flag order, split flags, long options, an end-of-options `--`, recursion without `-f`, or position among several operands. Shell globs with at least two literal characters before the first wildcard that can expand to a sensitive file name (`.en?`, `.e*`, `id_*`, `cred*`) are blocked. The existing patterns are unchanged, so nothing that was blocked before is now allowed.
2. `src/protocols.ts`: `readOptionalFile` reads once instead of `access()` then `readFile()` (CodeQL `js/file-system-race`). Behavior is preserved.
3. `src/tools.ts`: `asfdk_protocol_status` returns the snapshot through `redactProtocolPaths` outside development mode, matching `harness.status()`.
4. Tests for each, plus a registration, a handoff, and a thread entry.

## Rationale
Found while vendoring the harness into nlt-pi: the guardrail allowed `rm -fr ~`, `rm -rf -- /etc`, `rm -r -f /`, `rm --recursive --force ~`, `cat .en?` and `cat .e*`; CodeQL flagged the file race; the protocol-status tool handed absolute local paths to the model.

## Risks and trust boundaries
- `policy.ts` is a regex guardrail, not a security boundary. This narrows known gaps and does not make it one.
- More commands are blocked, so some legitimate commands may now be refused (for example a glob such as `sec*` or `cred*`). Broad globs (`*`, `*.json`, `.*`) stay allowed on purpose; the limit is documented in a test.
- No provider, deployment, persistence, or external-integration change.

## Alternatives considered
- Match only the literal `-fr` ordering: rejected; splits and long options would still pass.
- Block every glob: rejected; breaks ordinary commands (`ls *.json`, `git add *`).

## Outcome
Completed. 8 new tests; full unit suite 84 tests, 81 pass; the same 3 tests fail on the unmodified base (76 tests, 73 pass), so there is no regression. A mutation check (stashing the source changes) fails 3 of the new tests. `tsc --noEmit` passes. `cf:check` was not run.
