# Review Record Template

> Fill a copy of this file for **every** code, content, governance, or security
> review you conduct. Submit it as the review body (in the PR comment, issue
> comment, or handoff) using the structure below. The canonical review *format*
> is defined in `REVIEW.md` at the repository root; this template is the
> fillable incarnation of that format.
>
> **Governed by:** ORG-DEV-OTOI-1.0.3
> **Canonical format:** [`REVIEW.md`](../REVIEW.md)

---

## Review Metadata

**Reviewer:** [Agent name / platform]
**Review Date:** [ISO 8601 date, e.g. 2026-03-31T14:30:00-04:00]
**Review Type:** [Code | Content | Governance | Security]
**Scope:** [Files, pages, or sections reviewed]
**OTOI Version:** ORG-DEV-OTOI-1.0.3

---

## Pre-Review Checklist

- [ ] Read `NLT-DEV-OTOI.md` and understood governance requirements
- [ ] Identified the review scope and what is being evaluated
- [ ] Checked for any active threads in `docs/active-threads.md` related to this review
- [ ] Verified the review format matches `REVIEW.md`

---

## Review Findings

### Summary

[One paragraph: overall assessment of what was reviewed, key themes, and general verdict.]

### Strengths

- [What works well — be specific]
- [What's technically sound]
- [What aligns with HAIEF / Solidarity Framework mission]

### Issues

#### 🔴 Critical (must fix before merge/publish)

| # | File:Line | Issue | Recommended Fix |
|---|-----------|-------|-----------------|
| — | — | _No critical issues_ | — |

> 💡 **Note:** Remove placeholder rows before submitting a final review. If no
> issues exist at a severity level, leave a single "No issues" row or omit the
> table entirely.

#### 🟡 High Priority (should fix soon)

| # | File:Line | Issue | Recommended Fix |
|---|-----------|-------|-----------------|
| — | — | _No high-priority issues_ | — |

#### 🟢 Low Priority / Observations

- [Non-blocking suggestions, style notes, future improvements]

### Factual Accuracy

- [ ] All external claims (names, dates, statistics) verified against authoritative sources
- [ ] No hallucinated organizations, numbers, or URLs
- [ ] Sources cited where applicable

### Governance Compliance

- [ ] No credentials or secrets exposed
- [ ] No external integrations added without approval
- [ ] No architecture decisions made without approval
- [ ] Commit format follows `[AGENT_NAME] type(scope): description`
- [ ] `docs/active-threads.md` updated
- [ ] Handoff record written to `docs/agent-log/handoffs/`

---

## Verdict

**Status:** [APPROVED / CHANGES REQUESTED / BLOCKED]

**Rationale:** [One paragraph explaining the verdict and what needs to happen next.]

---

## Handoff Notes

**Next reviewer / agent needs to know:**
- [What was reviewed and what wasn't]
- [Any outstanding items or follow-ups]
- [Where to find related context]

---

*This review was conducted following the format defined in `REVIEW.md` under ORG-DEV-OTOI-1.0.3.*