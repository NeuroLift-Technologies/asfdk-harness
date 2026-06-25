import type { ContinuityRequest, ContinuityResponse } from "./types.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function handleContinuity(
  req: ContinuityRequest,
  kv: KVNamespace,
): Promise<ContinuityResponse> {
  const key = `swp:${req.userId}`;

  if (req.action === "load") {
    const raw = await kv.get(key, "json");
    return { context: (raw as Record<string, unknown>) ?? undefined };
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
