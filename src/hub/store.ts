/**
 * Storage for the Worker A2A hub (THREAD-019, design PR #43 §6.3): issued
 * agent IDs, issued cards with their revision trail, the registry, mailboxes,
 * observed lineage for the Composite Synthesis Gate, and counters.
 *
 * Runs inside the `A2AHub` Durable Object, whose single-threaded execution
 * makes each synchronous method atomic. Holds no email, name, OAuth `sub`,
 * token or IP address.
 *
 * Retention (owner baseline, NLT-HND-2026-002): messages, lineage and idle
 * registrations are dropped 24 hours after they were created or last used.
 * Every method purges expired rows first, so nothing expired is ever returned;
 * the Durable Object's alarm deletes them when the hub is idle.
 */

import {
  applyCardRequest,
  BINDING_MISMATCH_MESSAGE,
  type CardOutcome,
  type DeclaredCardFields,
  type StoredCard,
} from "../a2a-cards.js";
import { formatAgentId, slugify, type CallerIdentity, type CardSurface } from "../a2a-identity.js";
import {
  classifyHubIngress,
  DENY_COMPOSITE_EGRESS,
  DENY_COMPOSITE_EGRESS_MESSAGE,
  evaluateCompositeEgress,
  sameCard,
  type CardKey,
  type ReleasePolicy,
  type SourceContribution,
} from "./csg.js";
import type { SqlLike } from "./sql.js";
import {
  HUB_LIMITS,
  HUB_RETENTION_BASELINE,
  HUB_RETENTION_MS,
  type HubAgentSummary,
  type HubMessageType,
  type HubMessageView,
  type HubOutcome,
  type HubRegistration,
  type HubSendInput,
  type HubSendReceipt,
  type HubStatus,
} from "./types.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS agent_ids (
     agent_id TEXT PRIMARY KEY,
     platform TEXT NOT NULL,
     issued_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS cards (
     agent_id TEXT NOT NULL,
     agent_name TEXT NOT NULL,
     platform TEXT NOT NULL,
     auth_method TEXT NOT NULL,
     observed_client TEXT NOT NULL,
     surface TEXT NOT NULL,
     agent_fields TEXT NOT NULL,
     declared TEXT NOT NULL,
     revision INTEGER NOT NULL,
     issued_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     registered_at INTEGER,
     last_seen INTEGER,
     PRIMARY KEY (agent_id, agent_name)
   )`,
  // Which fields changed and when; never the old values.
  `CREATE TABLE IF NOT EXISTS card_revisions (
     agent_id TEXT NOT NULL,
     agent_name TEXT NOT NULL,
     revision INTEGER NOT NULL,
     changed_fields TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (agent_id, agent_name, revision)
   )`,
  // payload is cleared on delivery; the row stays until expiry so replyTo can be checked.
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY,
     from_agent_id TEXT NOT NULL,
     from_agent_name TEXT NOT NULL,
     to_agent_id TEXT NOT NULL,
     to_agent_name TEXT NOT NULL,
     type TEXT NOT NULL,
     payload TEXT,
     reply_to TEXT,
     sources TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     delivered_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS messages_inbox ON messages (to_agent_id, to_agent_name, delivered_at, created_at)`,
  // Trusted read observation for the CSG: which origins' content each card has received.
  `CREATE TABLE IF NOT EXISTS lineage (
     holder_agent_id TEXT NOT NULL,
     holder_agent_name TEXT NOT NULL,
     origin_agent_id TEXT NOT NULL,
     origin_agent_name TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     PRIMARY KEY (holder_agent_id, holder_agent_name, origin_agent_id, origin_agent_name)
   )`,
  // Counts only; no identities.
  `CREATE TABLE IF NOT EXISTS stats (
     key TEXT PRIMARY KEY,
     value INTEGER NOT NULL
   )`,
];

type MessageRow = {
  id: string;
  from_agent_id: string;
  from_agent_name: string;
  to_agent_id: string;
  to_agent_name: string;
  type: string;
  payload: string | null;
  reply_to: string | null;
  sources: string;
  created_at: number;
  expires_at: number;
  delivered_at: number | null;
};

type CardRow = {
  agent_id: string;
  agent_name: string;
  platform: string;
  auth_method: string;
  observed_client: string;
  surface: string;
  agent_fields: string;
  declared: string;
  revision: number;
  issued_at: string;
  updated_at: string;
  registered_at: number | null;
  last_seen: number | null;
};

const MAX_AGENT_ID_ATTEMPTS = 8;

export interface HubStoreOptions {
  now?: () => number;
}

export class HubStore {
  protected readonly sql: SqlLike;
  protected readonly now: () => number;

  constructor(sql: SqlLike, options: HubStoreOptions = {}) {
    this.sql = sql;
    this.now = options.now ?? Date.now;
    for (const statement of this.schema()) this.sql.exec(statement);
  }

  protected schema(): string[] {
    return SCHEMA;
  }

  /**
   * Issue a new `{platform}-{hex}` agent ID that no earlier authorization was
   * given. Called once per accepted authorization, before the grant is created.
   */
  reserveAgentId(platform: string): string {
    const safePlatform = slugify(platform) || "agent";
    for (let attempt = 0; attempt < MAX_AGENT_ID_ATTEMPTS; attempt++) {
      const candidate = formatAgentId(safePlatform);
      const inserted = this.sql
        .exec<{ agent_id: string }>(
          "INSERT INTO agent_ids (agent_id, platform, issued_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING agent_id",
          candidate,
          safePlatform,
          this.now(),
        )
        .toArray();
      if (inserted.length === 1) return candidate;
    }
    throw new Error("Could not issue a unique agent ID; try connecting again.");
  }

  /** Issue or edit the caller's card named `agentName` (design §6.2 lifecycle). */
  issueOrEditCard(caller: CallerIdentity, agentName: string, changes: DeclaredCardFields): CardOutcome {
    this.purgeExpired();
    const existing = this.readCard(caller.agentId, agentName);
    const outcome = applyCardRequest(existing, caller, agentName, changes, new Date(this.now()));
    if (!outcome.ok) return outcome;
    if (outcome.issued || outcome.changed.length > 0) this.writeCard(outcome.card, outcome.changed);
    return outcome;
  }

  readCard(agentId: string, agentName: string): StoredCard | undefined {
    const row = this.cardRow(agentId, agentName);
    return row ? rowToCard(row) : undefined;
  }

  /** Revision trail for one card: which fields changed and when. */
  cardRevisions(agentId: string, agentName: string): Array<{ revision: number; changedFields: string[]; updatedAt: string }> {
    return this.sql
      .exec<{ revision: number; changed_fields: string; updated_at: string }>(
        "SELECT revision, changed_fields, updated_at FROM card_revisions WHERE agent_id = ? AND agent_name = ? ORDER BY revision",
        agentId,
        agentName,
      )
      .toArray()
      .map((row) => ({ revision: row.revision, changedFields: JSON.parse(row.changed_fields) as string[], updatedAt: row.updated_at }));
  }

  // -------------------------------------------------------------------------
  // Registry
  // -------------------------------------------------------------------------

  /** List the caller's card in the hub, issuing it with defaults first if needed. */
  register(caller: CallerIdentity, agentName: string): HubOutcome<HubRegistration> {
    const issued = this.issueOrEditCard(caller, agentName, {});
    if (!issued.ok) return { ok: false, code: issued.code, message: issued.message };
    const now = this.now();
    this.sql.exec(
      "UPDATE cards SET registered_at = COALESCE(registered_at, ?), last_seen = ? WHERE agent_id = ? AND agent_name = ?",
      now,
      now,
      caller.agentId,
      agentName,
    );
    const row = this.cardRow(caller.agentId, agentName)!;
    return {
      ok: true,
      value: {
        card: rowToCard(row),
        registeredAt: new Date(row.registered_at!).toISOString(),
        expiresAt: new Date(now + HUB_RETENTION_MS).toISOString(),
      },
    };
  }

  /** Remove the caller's own registration and drop the messages waiting for it. */
  deregister(caller: CallerIdentity, agentName: string): HubOutcome<{ removed: boolean; droppedMessages: number }> {
    this.purgeExpired();
    const bound = this.boundCard(caller, agentName);
    if (!bound.ok) return bound;
    if (bound.value.registered_at === null) return { ok: true, value: { removed: false, droppedMessages: 0 } };
    const droppedMessages = this.dropRegistration({ agentId: caller.agentId, agentName });
    return { ok: true, value: { removed: true, droppedMessages } };
  }

  listAgents(caller: CallerIdentity, agentName: string): HubOutcome<HubAgentSummary[]> {
    this.purgeExpired();
    const self = this.registeredSelf(caller, agentName);
    if (!self.ok) return self;
    const rows = this.sql
      .exec<CardRow>(
        "SELECT * FROM cards WHERE registered_at IS NOT NULL ORDER BY last_seen DESC LIMIT ?",
        HUB_LIMITS.listAgents,
      )
      .toArray();
    return {
      ok: true,
      value: rows.map((row) => {
        const card = rowToCard(row);
        return {
          id: card.agentId,
          name: card.agentName,
          description: card.fields.description ?? `${card.agentName} connected to the ASFDK harness.`,
          lastSeen: new Date(row.last_seen ?? row.registered_at!).toISOString(),
        };
      }),
    };
  }

  getAgent(caller: CallerIdentity, agentName: string, target: CardKey): HubOutcome<StoredCard> {
    this.purgeExpired();
    const self = this.registeredSelf(caller, agentName);
    if (!self.ok) return self;
    const row = this.cardRow(target.agentId, target.agentName);
    if (!row || row.registered_at === null) {
      return { ok: false, code: "UNKNOWN_RECIPIENT", message: "No agent with that id and name is registered in the hub." };
    }
    return { ok: true, value: rowToCard(row) };
  }

  // -------------------------------------------------------------------------
  // Messages and the Composite Synthesis Gate
  // -------------------------------------------------------------------------

  /**
   * Route one message from the caller's card. Order (ADR-001 §3.3): identity
   * (the caller's bound, registered card; a registered recipient; no
   * unknown-recipient fallback), then the composite gate, then size and
   * inbox limits. Nothing is stored unless every check passes.
   */
  sendMessage(caller: CallerIdentity, agentName: string, input: HubSendInput, policy: ReleasePolicy): HubOutcome<HubSendReceipt> {
    this.purgeExpired();
    const self = this.registeredSelf(caller, agentName);
    if (!self.ok) return self;
    const from: CardKey = { agentId: caller.agentId, agentName };

    const recipient = this.cardRow(input.to.agentId, input.to.agentName);
    if (!recipient || recipient.registered_at === null) {
      return { ok: false, code: "UNKNOWN_RECIPIENT", message: "No agent with that id and name is registered in the hub. Nothing was sent." };
    }
    if (input.replyTo !== undefined) {
      const original = this.sql
        .exec<{ id: string }>(
          "SELECT id FROM messages WHERE id = ? AND to_agent_id = ? AND to_agent_name = ?",
          input.replyTo,
          from.agentId,
          from.agentName,
        )
        .toArray()[0];
      if (!original) {
        return { ok: false, code: "UNKNOWN_REPLY", message: "replyTo must be the id of a message delivered to you in the last 24 hours." };
      }
    }

    const sources = this.sourceSet(from);
    const decision = evaluateCompositeEgress({ sources, destination: input.to, policy });
    if (decision.decision === DENY_COMPOSITE_EGRESS) {
      this.bump("denied");
      return { ok: false, code: DENY_COMPOSITE_EGRESS, message: DENY_COMPOSITE_EGRESS_MESSAGE };
    }

    const payload = JSON.stringify(input.payload);
    if (new TextEncoder().encode(payload).length > HUB_LIMITS.payloadBytes) {
      return { ok: false, code: "PAYLOAD_TOO_LARGE", message: `payload must be at most ${HUB_LIMITS.payloadBytes} bytes as JSON.` };
    }
    const pending = this.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM messages WHERE to_agent_id = ? AND to_agent_name = ? AND delivered_at IS NULL",
        input.to.agentId,
        input.to.agentName,
      )
      .toArray()[0]!.count;
    if (pending >= HUB_LIMITS.pendingPerInbox) {
      return { ok: false, code: "INBOX_FULL", message: "The recipient's inbox is full. Try again after it reads its messages." };
    }

    const now = this.now();
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO messages (id, from_agent_id, from_agent_name, to_agent_id, to_agent_name, type, payload, reply_to, sources, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      from.agentId,
      from.agentName,
      input.to.agentId,
      input.to.agentName,
      input.type,
      payload,
      input.replyTo ?? null,
      JSON.stringify(sources.map((source) => source.origin)),
      now,
      now + HUB_RETENTION_MS,
    );
    this.touch(from);
    this.bump("delivered");
    return { ok: true, value: { id, to: input.to, status: "queued", expiresAt: new Date(now + HUB_RETENTION_MS).toISOString() } };
  }

  /** The caller's own undelivered messages, oldest first. Marks them delivered and clears their payloads. */
  inbox(caller: CallerIdentity, agentName: string, limit: number = 20): HubOutcome<HubMessageView[]> {
    this.purgeExpired();
    const self = this.registeredSelf(caller, agentName);
    if (!self.ok) return self;
    const holder: CardKey = { agentId: caller.agentId, agentName };
    const batch = Math.max(1, Math.min(HUB_LIMITS.inboxBatch, Math.floor(limit)));
    const rows = this.sql
      .exec<MessageRow>(
        `SELECT * FROM messages WHERE to_agent_id = ? AND to_agent_name = ? AND delivered_at IS NULL
         ORDER BY created_at, id LIMIT ?`,
        holder.agentId,
        holder.agentName,
        batch,
      )
      .toArray();
    const now = this.now();
    const views: HubMessageView[] = [];
    for (const row of rows) {
      views.push({
        id: row.id,
        from: { agentId: row.from_agent_id, agentName: row.from_agent_name },
        type: row.type as HubMessageType,
        payload: JSON.parse(row.payload ?? "null") as HubMessageView["payload"],
        ...(row.reply_to ? { replyTo: row.reply_to } : {}),
        createdAt: new Date(row.created_at).toISOString(),
        provenance: classifyHubIngress(),
      });
      this.sql.exec("UPDATE messages SET delivered_at = ?, payload = NULL WHERE id = ?", now, row.id);
      // Trusted read observation: the holder now carries these origins.
      for (const origin of JSON.parse(row.sources) as CardKey[]) {
        this.sql.exec(
          `INSERT INTO lineage (holder_agent_id, holder_agent_name, origin_agent_id, origin_agent_name, expires_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (holder_agent_id, holder_agent_name, origin_agent_id, origin_agent_name)
           DO UPDATE SET expires_at = MAX(expires_at, excluded.expires_at)`,
          holder.agentId,
          holder.agentName,
          origin.agentId,
          origin.agentName,
          now + HUB_RETENTION_MS,
        );
      }
    }
    this.touch(holder);
    return { ok: true, value: views };
  }

  status(caller: CallerIdentity, agentName: string, policy: ReleasePolicy): HubOutcome<HubStatus> {
    this.purgeExpired();
    const existing = this.cardRow(caller.agentId, agentName);
    if (existing && existing.observed_client !== caller.observedClient) {
      return { ok: false, code: "BINDING_MISMATCH", message: BINDING_MISMATCH_MESSAGE };
    }
    const count = (query: string) => this.sql.exec<{ count: number }>(query).toArray()[0]!.count;
    return {
      ok: true,
      value: {
        registeredAgents: count("SELECT COUNT(*) AS count FROM cards WHERE registered_at IS NOT NULL"),
        pendingMessages: count("SELECT COUNT(*) AS count FROM messages WHERE delivered_at IS NULL"),
        retention: { baseline: HUB_RETENTION_BASELINE, mailboxHours: 24, registrationIdleHours: 24 },
        csg: {
          enforced: true,
          surface: "worker-a2a-hub",
          releasesConfigured: policy.configured,
          releaseRules: policy.rules.length,
          delivered: this.stat("delivered"),
          denied: this.stat("denied"),
        },
        notification: {
          supported: false,
          detail: "The Worker has no host UI to present a governance notification directly to the person; denials are recorded in the hub's counters and the Worker logs.",
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Retention
  // -------------------------------------------------------------------------

  /** Delete everything past the 24-hour baseline. Returns how many rows went, by kind. */
  purgeExpired(): { messages: number; lineage: number; registrations: number } {
    const now = this.now();
    const messages = this.sql.exec<{ id: string }>("DELETE FROM messages WHERE expires_at <= ? RETURNING id", now).toArray().length;
    const lineage = this.sql
      .exec<{ holder_agent_id: string }>("DELETE FROM lineage WHERE expires_at <= ? RETURNING holder_agent_id", now)
      .toArray().length;
    const idle = this.sql
      .exec<{ agent_id: string; agent_name: string }>(
        "SELECT agent_id, agent_name FROM cards WHERE registered_at IS NOT NULL AND last_seen <= ?",
        now - HUB_RETENTION_MS,
      )
      .toArray();
    for (const card of idle) this.dropRegistration({ agentId: card.agent_id, agentName: card.agent_name });
    return { messages, lineage, registrations: idle.length };
  }

  /** The next time something expires, for the Durable Object alarm; null when nothing will. */
  nextExpiry(): number | null {
    const row = this.sql
      .exec<{ next: number | null }>(
        `SELECT MIN(next) AS next FROM (
           SELECT MIN(expires_at) AS next FROM messages
           UNION ALL SELECT MIN(expires_at) FROM lineage
           UNION ALL SELECT MIN(last_seen) + ? FROM cards WHERE registered_at IS NOT NULL
         )`,
        HUB_RETENTION_MS,
      )
      .toArray()[0];
    return row?.next ?? null;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private cardRow(agentId: string, agentName: string): CardRow | undefined {
    return this.sql.exec<CardRow>("SELECT * FROM cards WHERE agent_id = ? AND agent_name = ?", agentId, agentName).toArray()[0];
  }

  /** The caller's existing card, if the binding matches. */
  private boundCard(caller: CallerIdentity, agentName: string): HubOutcome<CardRow> {
    const row = this.cardRow(caller.agentId, agentName);
    if (!row) return { ok: false, code: "NOT_REGISTERED", message: "You have no card with that agentName. Call asfdk_hub_register first." };
    if (row.observed_client !== caller.observedClient) return { ok: false, code: "BINDING_MISMATCH", message: BINDING_MISMATCH_MESSAGE };
    return { ok: true, value: row };
  }

  /** The caller's card, bound and registered: the hub is visible only from inside it. */
  private registeredSelf(caller: CallerIdentity, agentName: string): HubOutcome<CardRow> {
    const bound = this.boundCard(caller, agentName);
    if (!bound.ok) return bound;
    if (bound.value.registered_at === null) {
      return { ok: false, code: "NOT_REGISTERED", message: "Your card is not registered in the hub. Call asfdk_hub_register first." };
    }
    this.touch({ agentId: caller.agentId, agentName });
    return bound;
  }

  /** The sender's new content plus every origin observed reaching it. */
  private sourceSet(sender: CardKey): SourceContribution[] {
    const observed = this.sql
      .exec<{ origin_agent_id: string; origin_agent_name: string }>(
        "SELECT origin_agent_id, origin_agent_name FROM lineage WHERE holder_agent_id = ? AND holder_agent_name = ?",
        sender.agentId,
        sender.agentName,
      )
      .toArray()
      .map((row) => ({ agentId: row.origin_agent_id, agentName: row.origin_agent_name }));
    const origins: CardKey[] = [sender];
    for (const origin of observed) if (!origins.some((known) => sameCard(known, origin))) origins.push(origin);
    // Every hub ingress is unknown_taint with no_derived_egress.
    return origins.map((origin) => ({ origin, noDerivedEgress: classifyHubIngress().no_derived_egress }));
  }

  private dropRegistration(card: CardKey): number {
    this.sql.exec("UPDATE cards SET registered_at = NULL WHERE agent_id = ? AND agent_name = ?", card.agentId, card.agentName);
    return this.sql
      .exec<{ id: string }>(
        "DELETE FROM messages WHERE to_agent_id = ? AND to_agent_name = ? AND delivered_at IS NULL RETURNING id",
        card.agentId,
        card.agentName,
      )
      .toArray().length;
  }

  private touch(card: CardKey): void {
    this.sql.exec(
      "UPDATE cards SET last_seen = ? WHERE agent_id = ? AND agent_name = ? AND registered_at IS NOT NULL",
      this.now(),
      card.agentId,
      card.agentName,
    );
  }

  private bump(key: string): void {
    this.sql.exec("INSERT INTO stats (key, value) VALUES (?, 1) ON CONFLICT (key) DO UPDATE SET value = value + 1", key);
  }

  private stat(key: string): number {
    return this.sql.exec<{ value: number }>("SELECT value FROM stats WHERE key = ?", key).toArray()[0]?.value ?? 0;
  }

  private writeCard(card: StoredCard, changed: string[]): void {
    this.sql.exec(
      `INSERT INTO cards (agent_id, agent_name, platform, auth_method, observed_client, surface, agent_fields, declared, revision, issued_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (agent_id, agent_name) DO UPDATE SET
         agent_fields = excluded.agent_fields,
         declared = excluded.declared,
         revision = excluded.revision,
         updated_at = excluded.updated_at`,
      card.agentId,
      card.agentName,
      card.platform,
      card.authMethod,
      card.observedClient,
      card.surface,
      JSON.stringify(card.fields),
      JSON.stringify(card.declared),
      card.revision,
      card.issuedAt,
      card.updatedAt,
    );
    this.sql.exec(
      "INSERT INTO card_revisions (agent_id, agent_name, revision, changed_fields, updated_at) VALUES (?, ?, ?, ?, ?)",
      card.agentId,
      card.agentName,
      card.revision,
      JSON.stringify(changed),
      card.updatedAt,
    );
  }
}

export function rowToCard(row: CardRow): StoredCard {
  return {
    agentId: row.agent_id,
    agentName: row.agent_name,
    platform: row.platform,
    authMethod: row.auth_method,
    observedClient: row.observed_client,
    surface: row.surface as CardSurface,
    fields: JSON.parse(row.agent_fields) as DeclaredCardFields,
    declared: JSON.parse(row.declared) as string[],
    revision: row.revision,
    issuedAt: row.issued_at,
    updatedAt: row.updated_at,
  };
}

export type { CardRow };
