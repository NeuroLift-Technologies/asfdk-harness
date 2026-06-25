---
description: Run NLT governance validation against the current repo
---

Run NLT governance compliance validation.

## Steps

1. If `.nltotoi/scripts/validate-governance.sh` exists in this repo, run it:
   ```bash
   bash .nltotoi/scripts/validate-governance.sh --strict
   ```

2. If the script does not exist, the repo is missing governance scaffolding. Follow SOP-NLT-002:
   `NeuroLift-Technologies/.github-private/SOPs/repo-governance-setup.md`

3. Report the result:
   - **PASS** — all checks passed, no warnings
   - **PASS WITH WARNINGS** — passed but some files empty or stale
   - **FAIL** — list which required files are missing and which content checks failed

4. If anything fails, propose remediation:
   - **Missing governance files** → trigger `sync-governance-public.yml` in `.github-private` or follow SOP-NLT-002
   - **Missing `.claude/` template** → next nightly run of `governance-auto-propagate.yml` will open a sync PR; or manually copy from `.github-private/.claude/`
   - **Content marker missing** (e.g., `ORG-DEV-OTOI-1.0.2` not present in `NLT-DEV-OTOI.md`) → do NOT edit the marker out; this indicates a content drift that needs investigation

5. Do not attempt to fix governance content yourself. Surface findings and let the human decide.
