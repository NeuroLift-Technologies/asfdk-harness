/**
 * Composite Synthesis Gate (CSG) for messages routed by the Worker A2A hub.
 * ADR-001 (NLT-ADR-2026-001) §3.3, affirmed for the hub by handoff NLT-HND-2026-002.
 *
 * - Ingress: the hub is the trusted boundary for hub messages. A message an
 *   agent sends is an unregistered MCP/A2A payload whose lineage the hub cannot
 *   verify, so it is classified `unknown_taint` with `no_derived_egress: true`.
 *   Caller-provided labels never lower that classification.
 * - Source set: the sender's own new content, plus every source the hub has
 *   observed reaching any card on the sender's connection (agent ID) within
 *   the retention window. Conservative: once any agent on a connection has
 *   read content from X, that connection's messages carry X as a contributor
 *   until the observation expires; a new agentName or client header cannot
 *   shed it.
 * - Evaluation, after identity and recipient checks: if two or more sources
 *   contributed, or any has `no_derived_egress`, every source must be
 *   explicitly releasable to the destination, or the result is
 *   `DENY_COMPOSITE_EGRESS` before anything is stored or delivered.
 * - Release: only a `USER_DECIDES` release from the human. OTOI has no release
 *   grammar yet (ADR §3.3/O3, OPEN), so releases are read from the operator-set
 *   `GOVERNANCE` KV key {@link RELEASE_POLICY_KEY}, which no tool can write.
 *   No releases configured means nothing is releasable: the gate fails closed.
 * - Content returning to the card it came from is a private delivery, not
 *   egress, and needs no release.
 *
 * Denials are sanitized: no source labels or identities reach the agent.
 */

/** GOVERNANCE KV key holding the human's A2A release decisions. */
export const RELEASE_POLICY_KEY = "a2a-releases";

export const DENY_COMPOSITE_EGRESS = "DENY_COMPOSITE_EGRESS";

export interface CardKey {
  agentId: string;
  agentName: string;
}

/** The ingress stamp on every message entering the hub. */
export interface HubIngressLabel {
  source: "unknown_taint";
  no_derived_egress: true;
  classifiedBy: "asfdk-a2a-hub";
}

export function classifyHubIngress(): HubIngressLabel {
  return { source: "unknown_taint", no_derived_egress: true, classifiedBy: "asfdk-a2a-hub" };
}

/** One contributor to an outbound message: where content came from, and its label. */
export interface SourceContribution {
  origin: CardKey;
  noDerivedEgress: boolean;
}

/** `agentId` may be `"*"`. `agentName` omitted matches every card of that agentId. */
export interface CardPattern {
  agentId: string;
  agentName?: string;
}

export interface ReleaseRule {
  from: CardPattern;
  to: CardPattern;
}

export interface ReleasePolicy {
  /** True when the KV key held a well-formed policy document. */
  configured: boolean;
  rules: ReleaseRule[];
  diagnostics: string[];
}

export const EMPTY_RELEASE_POLICY: ReleasePolicy = { configured: false, rules: [], diagnostics: [] };

export type EgressDecision = { decision: "RELEASE" } | { decision: typeof DENY_COMPOSITE_EGRESS };

/** What the sender is told on denial: operational status only (ADR §3.3 sanitized denial). */
export const DENY_COMPOSITE_EGRESS_MESSAGE =
  "The hub did not deliver this message and stored nothing. Content routed between agents is released only where the person who governs this hub has released that route. No release covers this message.";

function parsePattern(value: unknown): CardPattern | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { agentId, agentName } = value as Record<string, unknown>;
  if (typeof agentId !== "string" || agentId.length === 0 || agentId.length > 64) return undefined;
  if (agentName !== undefined && (typeof agentName !== "string" || agentName.length === 0 || agentName.length > 100)) {
    return undefined;
  }
  return agentName === undefined ? { agentId } : { agentId, agentName };
}

/**
 * Parse the release document. Anything unreadable yields no rules (fail closed).
 *
 * ```json
 * { "version": 1,
 *   "releases": [
 *     { "from": { "agentId": "claude-7f3a9c" }, "to": { "agentId": "chatgpt-91c2aa", "agentName": "Codex" } } ] }
 * ```
 */
export function parseReleasePolicy(raw: string | null | undefined): ReleasePolicy {
  if (raw === null || raw === undefined || raw.trim() === "") return EMPTY_RELEASE_POLICY;
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    return { configured: false, rules: [], diagnostics: [`${RELEASE_POLICY_KEY} is not valid JSON; no routes are released.`] };
  }
  const { version, releases } = (document ?? {}) as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(releases)) {
    return {
      configured: false,
      rules: [],
      diagnostics: [`${RELEASE_POLICY_KEY} must be { "version": 1, "releases": [...] }; no routes are released.`],
    };
  }
  const rules: ReleaseRule[] = [];
  const diagnostics: string[] = [];
  releases.forEach((entry, index) => {
    const from = parsePattern((entry as Record<string, unknown> | null)?.from);
    const to = parsePattern((entry as Record<string, unknown> | null)?.to);
    if (from && to) rules.push({ from, to });
    else diagnostics.push(`${RELEASE_POLICY_KEY} release ${index} is malformed and was ignored.`);
  });
  return { configured: true, rules, diagnostics };
}

function matches(pattern: CardPattern, card: CardKey): boolean {
  if (pattern.agentId !== "*" && pattern.agentId !== card.agentId) return false;
  return pattern.agentName === undefined || pattern.agentName === card.agentName;
}

export function sameCard(a: CardKey, b: CardKey): boolean {
  return a.agentId === b.agentId && a.agentName === b.agentName;
}

function releasable(origin: CardKey, destination: CardKey, policy: ReleasePolicy): boolean {
  if (sameCard(origin, destination)) return true;
  return policy.rules.some((rule) => matches(rule.from, origin) && matches(rule.to, destination));
}

/**
 * ADR-001 §3.3 composite precedence. Call only after identity, credential and
 * recipient checks have passed.
 */
export function evaluateCompositeEgress(input: {
  sources: SourceContribution[];
  destination: CardKey;
  policy: ReleasePolicy;
}): EgressDecision {
  const { sources, destination, policy } = input;
  // Incomplete lineage is never inferred safe.
  if (sources.length === 0) return { decision: DENY_COMPOSITE_EGRESS };
  const composite = sources.length >= 2 || sources.some((source) => source.noDerivedEgress);
  if (!composite) return { decision: "RELEASE" };
  return sources.every((source) => releasable(source.origin, destination, policy))
    ? { decision: "RELEASE" }
    : { decision: DENY_COMPOSITE_EGRESS };
}
