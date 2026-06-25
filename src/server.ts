import { routeAgentRequest } from "agents";

export { AsfdkGovernanceAgent } from "../agents/asfdk-governance/agent.js";

export default {
  async fetch(request: Request, env: Env) {
    // Minimal fail-closed bearer-token gate pending a richer auth decision
    // (e.g. Cloudflare Access). Without this the agent is reachable publicly.
    // ASFDK_API_TOKEN is a secret (set via `wrangler secret put`), so it is
    // not present in the generated Env type — read it via a narrow cast.
    const expectedToken = (env as Env & { ASFDK_API_TOKEN?: string })
      .ASFDK_API_TOKEN;
    const authHeader = request.headers.get("Authorization") ?? "";
    // Authorization scheme is case-insensitive per RFC 7235; preserve token casing.
    const presentedToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("bearer ".length)
      : undefined;

    // Fail closed: deny if the secret is unset or the bearer does not match.
    if (!expectedToken || presentedToken !== expectedToken) {
      return new Response("Unauthorized", { status: 401 });
    }

    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
