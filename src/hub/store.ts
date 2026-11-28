/**
 * Storage for the Worker A2A hub (THREAD-019, design PR #43 §6.3): issued
 * agent IDs and issued cards with their revision trail.
 *
 * Runs inside the `A2AHub` Durable Object, whose single-threaded execution
 * makes each synchronous method atomic. Holds no email, name, OAuth `sub`,
 * token or IP address.
 */

import { applyCardRequest, type CardOutcome, type DeclaredCardFields, type StoredCard } from "../a2a-cards.js";
import { formatAgentId, slugify, type CallerIdentity, type CardSurface } from "../a2a-identity.js";
import type { SqlLike } from "./sql.js";

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
];

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
    const existing = this.readCard(caller.agentId, agentName);
    const outcome = applyCardRequest(existing, caller, agentName, changes, new Date(this.now()));
    if (!outcome.ok) return outcome;
    if (outcome.issued || outcome.changed.length > 0) this.writeCard(outcome.card, outcome.changed);
    return outcome;
  }

  readCard(agentId: string, agentName: string): StoredCard | undefined {
    const row = this.sql
      .exec<CardRow>("SELECT * FROM cards WHERE agent_id = ? AND agent_name = ?", agentId, agentName)
      .toArray()[0];
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
