/**
 * Agent identity for server-issued A2A cards (THREAD-019, design PR #43).
 *
 * - The `agentId` is issued when a person accepts an MCP connection on the
 *   consent page (one per authorized connection) and rides in the encrypted
 *   grant props on every request. It is never a tool input.
 * - The `observedClient` is read from request headers on every call and bound
 *   to a card at issuance, so agents that share one authorization (Claude Code,
 *   Claude Cowork, Claude AI) cannot take over each other's cards.
 *
 * The observed client comes from headers the client itself sends. It separates
 * agents that share one human-approved connection; it is not a cryptographic
 * proof of identity (ADR-001 §3.1 per-agent key pairs are future work).
 *
 * No Node- or Worker-only imports: this module runs on both surfaces.
 */

/** Grant props fields this module reads. A structural subset of `McpAuthProps`. */
export interface CallerGrantProps {
  sub?: string;
  authMethod?: string;
  agentId?: string;
  agentPlatform?: string;
}

export type CardSurface = "worker" | "local";

/** Who is calling, as the server resolved it. Never contains email, name or `sub`. */
export interface CallerIdentity {
  agentId: string;
  platform: string;
  authMethod: string;
  observedClient: string;
  surface: CardSurface;
}

export type CallerResolution =
  | { ok: true; caller: CallerIdentity }
  | { ok: false; reason: "static-token" | "reconnect" | "unauthenticated"; message: string };

export const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const PLATFORM_MAX_LENGTH = 24;
/** 3 random bytes = 6 hex characters (the design allows 4 to 6). */
const AGENT_ID_SUFFIX_BYTES = 3;

/** Lowercase `[a-z0-9-]` slug, or "" when nothing usable remains. */
export function slugify(value: string, maxLength = PLATFORM_MAX_LENGTH): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/**
 * The platform part of an agentId. A Client ID Metadata Document client is
 * named after the host of its HTTPS client ID (`https://claude.ai/...` →
 * `claude`, `https://chatgpt.com/...` → `chatgpt`); a self-registered client
 * after its registered name. Falls back to `agent`.
 */
export function platformFromClient(client: { clientId?: string; clientName?: string }): string {
  const fromUrl = platformFromClientIdUrl(client.clientId);
  if (fromUrl) return fromUrl;
  const fromName = client.clientName ? slugify(client.clientName) : "";
  return fromName || "agent";
}

function platformFromClientIdUrl(clientId: string | undefined): string | undefined {
  if (!clientId || !/^https:\/\//i.test(clientId)) return undefined;
  let host: string;
  try {
    host = new URL(clientId).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const labels = host.replace(/^www\./, "").split(".").filter(Boolean);
  // claude.ai → claude; chatgpt.com → chatgpt; mcp.vscode.dev → vscode.
  const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return label ? slugify(label) || undefined : undefined;
}

export function randomAgentIdSuffix(bytes = AGENT_ID_SUFFIX_BYTES): string {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `{platform}-{suffix}`, for example `claude-7f3a9c`. */
export function formatAgentId(platform: string, suffix: string = randomAgentIdSuffix()): string {
  const id = `${slugify(platform) || "agent"}-${suffix}`;
  if (!AGENT_ID_PATTERN.test(id)) throw new Error(`Generated agent ID is malformed: ${id}`);
  return id;
}

// ---------------------------------------------------------------------------
// Observed client
// ---------------------------------------------------------------------------

/** `x-anthropic-client` values seen in Workers logs, mapped to stable kinds. */
const ANTHROPIC_CLIENTS: Record<string, string> = {
  claudecode: "claude-code",
  cowork: "claude-cowork",
  claudeai: "claude-ai",
};

const DEFAULT_AGENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-cowork": "Claude Cowork",
  "claude-ai": "Claude AI",
  codex: "Codex",
  chatgpt: "ChatGPT",
};

interface HeaderSource {
  get(name: string): string | null | undefined;
}

/** Accepts a Fetch `Headers`, or the plain header record the MCP SDK puts in `requestInfo`. */
export function headerSource(headers: unknown): HeaderSource {
  if (headers && typeof (headers as Headers).get === "function") return headers as Headers;
  const record = (headers ?? {}) as Record<string, string | string[] | undefined>;
  return {
    get(name: string) {
      const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
      const value = key ? record[key] : undefined;
      return Array.isArray(value) ? value.join(", ") : value;
    },
  };
}

/**
 * A stable kind for the calling client, without version numbers so a client
 * upgrade does not break the card binding. `x-anthropic-client` wins over
 * `user-agent`: every Claude product sends the same `Claude-User` user agent.
 */
export function observedClientFromHeaders(headers: unknown): string {
  const source = headerSource(headers);
  const anthropic = source.get("x-anthropic-client")?.trim();
  if (anthropic) {
    const key = anthropic.toLowerCase().replace(/[^a-z0-9]/g, "");
    return ANTHROPIC_CLIENTS[key] ?? (slugify(anthropic, 40) || "unknown");
  }
  return observedClientFromUserAgent(source.get("user-agent") ?? "");
}

export function observedClientFromUserAgent(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) return "unknown";
  if (/^openai-mcp\//i.test(ua)) return /\(codex\)/i.test(ua) ? "codex" : "chatgpt";
  // First product token without its version: "codex-mcp-client/0.0.0" → "codex-mcp-client".
  const product = ua.split(/\s+/)[0]?.split("/")[0] ?? "";
  return slugify(product, 40) || "unknown";
}

/** The `agentName` the server fills in when the agent passes none. */
export function defaultAgentName(observedClient: string): string {
  const known = DEFAULT_AGENT_NAMES[observedClient];
  if (known) return known;
  const words = observedClient.split("-").filter(Boolean);
  return words.length > 0 ? words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ") : "Agent";
}

// ---------------------------------------------------------------------------
// Caller resolution
// ---------------------------------------------------------------------------

export const RECONNECT_MESSAGE =
  "This connection was authorized before agent IDs were issued, so it has no agent ID yet. Disconnect this MCP connector and connect it again once; the new authorization is issued an agent ID.";
export const STATIC_TOKEN_MESSAGE =
  "A2A cards are issued only to connections authorized through the consent page. This request used the shared API token, which has no authorization to issue an agent ID from. Connect through OAuth instead.";

/**
 * Worker surface: identity from the grant props the OAuth provider decrypted
 * for this request (`extra.authInfo.extra.props`), plus the observed client.
 */
export function resolveWorkerCaller(props: CallerGrantProps | undefined, headers: unknown): CallerResolution {
  if (!props) {
    return { ok: false, reason: "unauthenticated", message: "This request carries no authorization." };
  }
  if (props.authMethod === "static-token") {
    return { ok: false, reason: "static-token", message: STATIC_TOKEN_MESSAGE };
  }
  if (!props.agentId || !AGENT_ID_PATTERN.test(props.agentId)) {
    return { ok: false, reason: "reconnect", message: RECONNECT_MESSAGE };
  }
  return {
    ok: true,
    caller: {
      agentId: props.agentId,
      platform: props.agentPlatform ?? props.agentId.replace(/-[0-9a-f]+$/, ""),
      authMethod: props.authMethod ?? "unknown",
      observedClient: observedClientFromHeaders(headers),
      surface: "worker",
    },
  };
}

/**
 * Local surface: there is no consent page, so the agentId is `local-{client}`
 * from the MCP `clientInfo.name` (stdio) or the user agent (HTTP).
 */
export function resolveLocalCaller(clientName: string | undefined, headers: unknown): CallerResolution {
  const observedClient = clientName ? slugify(clientName, 40) || "unknown" : observedClientFromHeaders(headers);
  return {
    ok: true,
    caller: {
      agentId: `local-${observedClient}`.slice(0, 48).replace(/-+$/, ""),
      platform: "local",
      authMethod: "local",
      observedClient,
      surface: "local",
    },
  };
}
