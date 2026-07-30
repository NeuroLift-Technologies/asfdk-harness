# Escalation Record — Round-2 / PR#3 architectural & safety decisions

## Escalation Record

**Date:** 2026-06-25T17:46:12-04:00
**Agent:** Claude Code (claude-opus-4-8)
**Session:** `round-2-consolidation`
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** high

---

### Trigger

The adversarial review of the round-2 consolidation (PR#3) surfaced three decisions that exceed agent authority — an architecture/security-threshold call, an architecture call, and a safety-threshold call. Per OTOI §4.4 and the personal `.toi`, these are escalated rather than decided autonomously. The underlying critical security holes were fixed with conservative, fail-closed defaults; these three items remain open.

---

### Situation

PR#3 (`round-2-consolidation`, DRAFT — https://github.com/NeuroLift-Technologies/asfdk-harness/pull/3) consolidates a **deployable Cloudflare Workers governance agent** (`src/server.ts`, `agents/asfdk-governance/`, `src/governance/*`). The review found it shipped with no authentication, cross-user state bleed, and unauthenticated code execution; all were remediated. What remains are decisions about the *intended* design and thresholds, which must be made before the Worker can safely ship.

---

### Decision Required

1. **Production auth mechanism for the Worker.** The fix added a fail-closed **bearer-token** gate (`ASFDK_API_TOKEN`) as a minimum. Is a bearer token acceptable for production, or should this use **Cloudflare Access / Zero Trust** (and bind a real per-user identity)?
2. **Reconcile the two divergent governance stacks.** The Pi harness uses the real `@neurolift-technologies/asfdk` package; the Worker **reimplements crisis/continuity as bespoke LLM prompts** labeled "RRT Advocate" / "Sleepwalker Protocol." Unify on the asfdk package (runs under `nodejs_compat`), or keep the bespoke path but **stop labeling it as the real protocols**?
3. **Crisis escalation threshold.** `assessCrisis` currently auto-escalates only on **BLACK**. Should **RED** ("significant crisis signals, safety concern language") also auto-escalate?

---

### Options Considered

1. **Auth mechanism**
   - **Bearer token (current):** simplest; fail-closed; one shared secret → no per-user identity, weaker for multi-user/crisis data.
   - **Cloudflare Access / Zero Trust:** identity-aware (JWT), per-user, auditable; more setup; the correct posture for mental-health/crisis data. *(Recommended.)*

2. **Governance stacks**
   - **Unify on the asfdk package in the Worker:** one source of truth; the Worker gets the real RRT Advocate / Sleepwalker logic; some Workers-compat work.
   - **Keep bespoke + relabel:** least effort; but two diverging governance implementations and misleading "RRT/Sleepwalker" labels persist.

3. **Crisis threshold**
   - **BLACK-only (current):** fewer interventions; risks under-escalating genuine RED safety-concern cases.
   - **RED + BLACK:** more conservative/safer for a crisis system; more human-escalation load.

---

### Recommendation

1. **Cloudflare Access / Zero Trust** for production, with per-user identity threaded into continuity/crisis (the bearer gate is fine as an interim fail-closed floor).
2. **Unify on the asfdk package** so the Worker uses the real RRT Advocate / Sleepwalker logic; if that must wait, relabel the bespoke path now so it doesn't claim to be the real protocols.
3. **Escalate on RED and BLACK** — for a crisis-detection system, err toward over-escalation.

---

### Blockers

- PR#3 must **not merge or deploy** until decision (1) is made and `ASFDK_API_TOKEN` is provisioned (`wrangler secret put`) — until then the fail-closed gate 401s all traffic by design.
- Decisions (2) and (3) do not block merge but should be resolved before the Worker is relied on in production.

---

### Resolution

*(To be filled in after Joshua responds)*

**Date resolved:** [ISO 8601]
**Decision:** [What was decided]
**Decided by:** [Name]
**Actions taken:** [What was done as a result]
