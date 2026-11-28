/**
 * `A2AHub` — the SQLite-backed Durable Object behind the Worker's A2A hub
 * (THREAD-019). One named instance holds issued agent IDs and cards.
 *
 * Reachable only through RPC from the Worker's own code: the OAuth callback
 * (agent ID issuance) and the MCP tool handlers. It has no HTTP surface:
 * `fetch()` always answers 404, and `server.ts` keeps this binding out of the
 * environment it hands to `routeAgentRequest`.
 */

import { DurableObject } from "cloudflare:workers";
import type { CardOutcome, DeclaredCardFields } from "../a2a-cards.js";
import type { CallerIdentity } from "../a2a-identity.js";
import { HubStore } from "./store.js";

/** The one hub instance's name. */
export const A2A_HUB_INSTANCE = "a2a-hub";

export class A2AHub extends DurableObject<Env> {
  readonly #store: HubStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = new HubStore(ctx.storage.sql);
  }

  /** No HTTP surface: the hub is reachable only through the MCP server. */
  override async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  }

  async reserveAgentId(platform: string): Promise<string> {
    return this.#store.reserveAgentId(platform);
  }

  async issueOrEditCard(caller: CallerIdentity, agentName: string, changes: DeclaredCardFields): Promise<CardOutcome> {
    return this.#store.issueOrEditCard(caller, agentName, changes);
  }
}
