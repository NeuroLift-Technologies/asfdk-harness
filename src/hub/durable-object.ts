/**
 * `A2AHub` — the SQLite-backed Durable Object behind the Worker's A2A hub
 * (THREAD-020). One named instance holds issued agent IDs and cards, the
 * registry, mailboxes and the lineage the Composite Synthesis Gate reads.
 *
 * Reachable only through RPC from the Worker's own code: the OAuth callback
 * (agent ID issuance) and the MCP tool handlers. It has no HTTP surface:
 * `fetch()` always answers 404, and `server.ts` keeps this binding out of the
 * environment it hands to `routeAgentRequest`.
 *
 * The gate runs here, inside the hub, before anything is stored: the release
 * policy is read from the operator-set `GOVERNANCE` KV key by the hub itself,
 * never passed in by a caller.
 */

import { DurableObject } from "cloudflare:workers";
import type { CardOutcome, DeclaredCardFields, StoredCard } from "../a2a-cards.js";
import type { CallerIdentity } from "../a2a-identity.js";
import { EMPTY_RELEASE_POLICY, parseReleasePolicy, RELEASE_POLICY_KEY, type CardKey, type ReleasePolicy } from "./csg.js";
import { HubStore } from "./store.js";
import type {
  HubAgentSummary,
  HubBackend,
  HubMessageView,
  HubOutcome,
  HubRegistration,
  HubSendInput,
  HubSendReceipt,
  HubStatus,
} from "./types.js";

/** The one hub instance's name. */
export const A2A_HUB_INSTANCE = "a2a-hub";

export class A2AHub extends DurableObject<Env> implements HubBackend {
  readonly #store: HubStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = new HubStore(ctx.storage.sql);
  }

  /** No HTTP surface: the hub is reachable only through the MCP server. */
  override async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  }

  /** Retention: drop what passed the 24-hour baseline, then wait for the next expiry. */
  override async alarm(): Promise<void> {
    this.#store.purgeExpired();
    await this.#scheduleRetention();
  }

  async reserveAgentId(platform: string): Promise<string> {
    return this.#store.reserveAgentId(platform);
  }

  async issueOrEditCard(caller: CallerIdentity, agentName: string, changes: DeclaredCardFields): Promise<CardOutcome> {
    return this.#store.issueOrEditCard(caller, agentName, changes);
  }

  async register(caller: CallerIdentity, agentName: string): Promise<HubOutcome<HubRegistration>> {
    return this.#after(this.#store.register(caller, agentName));
  }

  async deregister(caller: CallerIdentity, agentName: string): Promise<HubOutcome<{ removed: boolean; droppedMessages: number }>> {
    return this.#after(this.#store.deregister(caller, agentName));
  }

  async listAgents(caller: CallerIdentity, agentName: string): Promise<HubOutcome<HubAgentSummary[]>> {
    return this.#after(this.#store.listAgents(caller, agentName));
  }

  async getAgent(caller: CallerIdentity, agentName: string, target: CardKey): Promise<HubOutcome<StoredCard>> {
    return this.#after(this.#store.getAgent(caller, agentName, target));
  }

  async sendMessage(caller: CallerIdentity, agentName: string, input: HubSendInput): Promise<HubOutcome<HubSendReceipt>> {
    const policy = await this.#releasePolicy();
    const outcome = this.#store.sendMessage(caller, agentName, input, policy);
    if (!outcome.ok && outcome.code === "DENY_COMPOSITE_EGRESS") {
      // Operator record only (Workers logs). Not a notification to the person, and not shown to the agent.
      console.warn(
        `[asfdk-a2a-hub] DENY_COMPOSITE_EGRESS from=${caller.agentId}/${agentName} to=${input.to.agentId}/${input.to.agentName} releases=${policy.rules.length}`,
      );
    }
    return this.#after(outcome);
  }

  async inbox(caller: CallerIdentity, agentName: string, limit?: number): Promise<HubOutcome<HubMessageView[]>> {
    return this.#after(this.#store.inbox(caller, agentName, limit));
  }

  async status(caller: CallerIdentity, agentName: string): Promise<HubOutcome<HubStatus>> {
    return this.#store.status(caller, agentName, await this.#releasePolicy());
  }

  /** The human's release decisions. Unreadable or missing → nothing is releasable (fail closed). */
  async #releasePolicy(): Promise<ReleasePolicy> {
    try {
      const policy = parseReleasePolicy(await this.env.GOVERNANCE.get(RELEASE_POLICY_KEY));
      for (const diagnostic of policy.diagnostics) console.warn(`[asfdk-a2a-hub] ${diagnostic}`);
      return policy;
    } catch (error) {
      console.warn(`[asfdk-a2a-hub] release policy unavailable; no routes are released: ${String(error)}`);
      return EMPTY_RELEASE_POLICY;
    }
  }

  async #after<T>(outcome: T): Promise<T> {
    await this.#scheduleRetention();
    return outcome;
  }

  async #scheduleRetention(): Promise<void> {
    const next = this.#store.nextExpiry();
    if (next === null) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next) await this.ctx.storage.setAlarm(next);
  }
}
