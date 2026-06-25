import type { ContinuityRequest, ContinuityResponse } from "./types.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleContinuity(
  req: ContinuityRequest,
  kv?: KVNamespace,
): Promise<ContinuityResponse> {
  // Guard against a missing/misconfigured KV binding rather than crashing.
  if (!kv) {
    return req.action === "save" ? { saved: false } : {};
  }
  // Validate the identity before it becomes part of the KV key so a caller
  // cannot traverse keys or collide with another user's record.
  if (!USER_ID_PATTERN.test(req.userId)) {
    return req.action === "save" ? { saved: false } : {};
  }

  const key = `swp:${req.userId}`;

  if (req.action === "load") {
    const raw = await kv.get(key, "json");
    // Validate the shape of stored JSON instead of blind-casting.
    return { context: isPlainObject(raw) ? raw : undefined };
  }

  if (req.action === "save") {
    if (!req.sessionData) return { saved: false };
    await kv.put(key, JSON.stringify(req.sessionData), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
    return { saved: true };
  }

  return {};
}
