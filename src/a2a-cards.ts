/**
 * Issued A2A card lifecycle (THREAD-020, design PR #43 §6.2).
 *
 * Issue once, then the agent edits: the first request for an `agentName` under
 * an authorization issues that card; later requests with the same name return
 * it and apply any fields passed. The `agentId`, the governance block and the
 * issuance record are never inputs. A card is bound to the observed client
 * recorded at issuance.
 *
 * Pure logic plus an in-memory store for the local server. The Worker keeps
 * cards in the A2AHub Durable Object, which applies the same `applyCardRequest`.
 */

import { z } from "zod";
import type { CallerIdentity, CardSurface } from "./a2a-identity.js";
import type { A2ASkill } from "./a2a.js";

export const CARD_LIMITS = {
  agentName: 100,
  description: 1_000,
  url: 2_048,
  version: 64,
  modes: 16,
  skills: 32,
  skillText: 100,
  skillDescription: 1_000,
  tags: 16,
  tag: 50,
  examples: 8,
  example: 500,
} as const;

/** Printable text: no control characters (keeps names and ids safe to log and render). */
const printable = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "must not contain control characters");

const mimeType = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+*-]+$/, "must be a MIME type such as text/plain");

const skillSchema = z
  .object({
    id: printable(CARD_LIMITS.skillText).min(1),
    name: printable(CARD_LIMITS.skillText).min(1),
    description: printable(CARD_LIMITS.skillDescription),
    tags: z.array(printable(CARD_LIMITS.tag).min(1)).max(CARD_LIMITS.tags),
    examples: z.array(printable(CARD_LIMITS.example)).max(CARD_LIMITS.examples).optional(),
    inputModes: z.array(mimeType).max(CARD_LIMITS.modes).optional(),
    outputModes: z.array(mimeType).max(CARD_LIMITS.modes).optional(),
  })
  .strict();

export const agentNameSchema = printable(CARD_LIMITS.agentName)
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, "must not be empty");

/** The fields an agent may set on its own card (mirrors `A2AAgentCardOptions`). */
export const declaredCardFieldsShape = {
  description: printable(CARD_LIMITS.description).optional(),
  url: z.string().max(CARD_LIMITS.url).optional(),
  version: printable(CARD_LIMITS.version).optional(),
  defaultInputModes: z.array(mimeType).max(CARD_LIMITS.modes).optional(),
  defaultOutputModes: z.array(mimeType).max(CARD_LIMITS.modes).optional(),
  streaming: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  skills: z.array(skillSchema).max(CARD_LIMITS.skills).optional(),
};

export const DECLARED_FIELD_NAMES = Object.keys(declaredCardFieldsShape) as Array<keyof DeclaredCardFields>;

export interface DeclaredCardFields {
  description?: string;
  url?: string;
  version?: string;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  streaming?: boolean;
  pushNotifications?: boolean;
  skills?: A2ASkill[];
}

/** What the server stores for one issued card. Holds no email, name, `sub` or token. */
export interface StoredCard {
  agentId: string;
  agentName: string;
  platform: string;
  authMethod: string;
  observedClient: string;
  surface: CardSurface;
  fields: DeclaredCardFields;
  /** Every field the agent has set so far. */
  declared: string[];
  revision: number;
  issuedAt: string;
  updatedAt: string;
}

export type CardOutcome =
  | { ok: true; card: StoredCard; issued: boolean; changed: string[] }
  | { ok: false; code: "BINDING_MISMATCH" | "INVALID_FIELD"; message: string };

/** Card storage on either surface. Worker: the A2AHub Durable Object. Local: memory. */
export interface CardBackend {
  issueOrEditCard(caller: CallerIdentity, agentName: string, changes: DeclaredCardFields): Promise<CardOutcome>;
}

export const BINDING_MISMATCH_MESSAGE =
  "This card was issued to a different client on this connection, so this client cannot read or edit it. Pass a different agentName to be issued a card of your own.";

/** URL rule: `https://` only, plus `http://localhost` / loopback on the local server. */
export function validateCardUrl(url: string, surface: CardSurface): string | undefined {
  if (url === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "url must be an absolute URL";
  }
  if (parsed.username || parsed.password) return "url must not contain credentials";
  if (parsed.protocol === "https:") return undefined;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol === "http:" && loopback && surface === "local") return undefined;
  return surface === "local" ? "url must use https:// (or http://localhost)" : "url must use https://";
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Issue or edit one card. Returns the next stored state, or a refusal. The
 * caller's `agentId` selects the authorization; `agentName` selects the card.
 */
export function applyCardRequest(
  existing: StoredCard | undefined,
  caller: CallerIdentity,
  agentName: string,
  changes: DeclaredCardFields,
  now: Date = new Date(),
): CardOutcome {
  if (changes.url !== undefined) {
    const urlError = validateCardUrl(changes.url, caller.surface);
    if (urlError) return { ok: false, code: "INVALID_FIELD", message: urlError };
  }
  if (existing && existing.observedClient !== caller.observedClient) {
    return { ok: false, code: "BINDING_MISMATCH", message: BINDING_MISMATCH_MESSAGE };
  }

  const timestamp = now.toISOString();
  const base: StoredCard = existing ?? {
    agentId: caller.agentId,
    agentName,
    platform: caller.platform,
    authMethod: caller.authMethod,
    observedClient: caller.observedClient,
    surface: caller.surface,
    fields: {},
    declared: [],
    revision: 0,
    issuedAt: timestamp,
    updatedAt: timestamp,
  };

  const fields: DeclaredCardFields = { ...base.fields };
  const changed: string[] = [];
  for (const name of DECLARED_FIELD_NAMES) {
    const value = changes[name];
    if (value === undefined) continue;
    if (!sameValue(fields[name], value)) changed.push(name);
    (fields as Record<string, unknown>)[name] = value;
  }

  if (existing && changed.length === 0) {
    return { ok: true, card: existing, issued: false, changed };
  }

  const declared = [...new Set([...base.declared, ...DECLARED_FIELD_NAMES.filter((name) => changes[name] !== undefined)])];
  return {
    ok: true,
    issued: !existing,
    changed,
    card: {
      ...base,
      fields,
      declared,
      revision: base.revision + 1,
      updatedAt: timestamp,
    },
  };
}

/** Local server: issued cards live in memory for the life of the process (design §6.4). */
export class MemoryCardStore implements CardBackend {
  readonly #cards = new Map<string, StoredCard>();

  async issueOrEditCard(caller: CallerIdentity, agentName: string, changes: DeclaredCardFields): Promise<CardOutcome> {
    const key = JSON.stringify([caller.agentId, agentName]);
    const outcome = applyCardRequest(this.#cards.get(key), caller, agentName, changes);
    if (outcome.ok) this.#cards.set(key, outcome.card);
    return outcome;
  }
}
