/**
 * The Worker A2A hub as the MCP tools see it (THREAD-019, design PR #43 §6.3).
 * Every operation acts as the caller's own card, selected by `agentName` and
 * checked against the card's binding. Implemented by the `A2AHub` Durable Object.
 */

import type { CardBackend, StoredCard } from "../a2a-cards.js";
import type { CallerIdentity } from "../a2a-identity.js";
import type { CardKey, HubIngressLabel } from "./csg.js";

export const HUB_MESSAGE_TYPES = ["task", "message", "event"] as const;
export type HubMessageType = (typeof HUB_MESSAGE_TYPES)[number];

/**
 * Retention baseline for the hub: registrations and mailboxes hold data for up
 * to 24 hours, then it is dropped. Owner decision of 2026-11-28 (handoff
 * NLT-HND-2026-002), overriding ADR-001 O8's NONE purge for the Worker A2A
 * routing layer only. Not Sleepwalker's intervention level `PASSIVE`.
 */
export const HUB_RETENTION_MS = 24 * 60 * 60 * 1000;
export const HUB_RETENTION_BASELINE = "passive-24h";

export const HUB_LIMITS = {
  payloadBytes: 32 * 1024,
  pendingPerInbox: 100,
  inboxBatch: 50,
  listAgents: 200,
} as const;

export type HubErrorCode =
  | "BINDING_MISMATCH"
  | "INVALID_FIELD"
  | "NOT_REGISTERED"
  | "UNKNOWN_RECIPIENT"
  | "UNKNOWN_REPLY"
  | "DENY_COMPOSITE_EGRESS"
  | "PAYLOAD_TOO_LARGE"
  | "INBOX_FULL";

export type HubOutcome<T> = { ok: true; value: T } | { ok: false; code: HubErrorCode; message: string };

export interface HubRegistration {
  card: StoredCard;
  registeredAt: string;
  /** When the registration auto-drops if the card makes no further hub calls. */
  expiresAt: string;
}

export interface HubAgentSummary {
  id: string;
  name: string;
  description: string;
  lastSeen: string;
}

export interface HubSendInput {
  to: CardKey;
  type: HubMessageType;
  payload: string | Record<string, unknown>;
  replyTo?: string;
}

export interface HubSendReceipt {
  id: string;
  to: CardKey;
  status: "queued";
  expiresAt: string;
}

/** A message as its recipient sees it. Contributor sources are never disclosed. */
export interface HubMessageView {
  id: string;
  from: CardKey;
  type: HubMessageType;
  payload: string | Record<string, unknown>;
  replyTo?: string;
  createdAt: string;
  provenance: HubIngressLabel;
}

export interface HubStatus {
  registeredAgents: number;
  pendingMessages: number;
  retention: { baseline: typeof HUB_RETENTION_BASELINE; mailboxHours: number; registrationIdleHours: number };
  csg: {
    enforced: true;
    surface: "worker-a2a-hub";
    releasesConfigured: boolean;
    releaseRules: number;
    delivered: number;
    denied: number;
  };
  notification: { supported: false; detail: string };
}

export interface HubBackend extends CardBackend {
  register(caller: CallerIdentity, agentName: string): Promise<HubOutcome<HubRegistration>>;
  deregister(caller: CallerIdentity, agentName: string): Promise<HubOutcome<{ removed: boolean; droppedMessages: number }>>;
  listAgents(caller: CallerIdentity, agentName: string): Promise<HubOutcome<HubAgentSummary[]>>;
  getAgent(caller: CallerIdentity, agentName: string, target: CardKey): Promise<HubOutcome<StoredCard>>;
  sendMessage(caller: CallerIdentity, agentName: string, input: HubSendInput): Promise<HubOutcome<HubSendReceipt>>;
  inbox(caller: CallerIdentity, agentName: string, limit?: number): Promise<HubOutcome<HubMessageView[]>>;
  status(caller: CallerIdentity, agentName: string): Promise<HubOutcome<HubStatus>>;
}
