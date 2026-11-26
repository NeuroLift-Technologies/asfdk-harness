import { routeAgentRequest } from "agents";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AsfdkHarness } from "./harness.js";
import { createMcpServer } from "./mcp-server.js";
import {
  AUTHORIZE_PATH,
  CALLBACK_PATH,
  handleAuthorize,
  handleCallback,
  type McpAuthProps,
  type OAuthHandlerEnv,
} from "./oauth/access-handler.js";
import { secretsMatch } from "./oauth/access-oidc.js";

export { AsfdkGovernanceAgent } from "../agents/asfdk-governance/agent.js";

const MCP_PATH = "/mcp";
const TOKEN_PATH = "/token";
const REGISTER_PATH = "/register";

/**
 * MCP grants live as long as the Cloudflare Access session (168h on the Access
 * application), so removing someone from the Access policy cuts off MCP access
 * within a week at most. Access tokens themselves last 1 hour (library default).
 */
const MCP_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

type WorkerEnv = Env & { ASFDK_API_TOKEN?: string; ASFDK_TOI_CONTENT?: string; ASFDK_OTOI_CONTENT?: string };

let mcpHarnessPromise: Promise<AsfdkHarness> | undefined;

function readBearerToken(request: Request): string | undefined {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice("bearer ".length).trim() : undefined;
}

/** Legacy shared-secret check (ASFDK_API_TOKEN). Fails closed when the secret is unset. */
async function staticTokenMatches(token: string | undefined, env: WorkerEnv): Promise<boolean> {
  const expected = env.ASFDK_API_TOKEN;
  return Boolean(expected && token && (await secretsMatch(token, expected)));
}

async function getMcpHarness(env: WorkerEnv): Promise<AsfdkHarness> {
  if (!mcpHarnessPromise) {
    mcpHarnessPromise = (async () => {
      // Prefer KV-stored content (updatable without redeploy); fall back to secrets.
      const [kvToi, kvOtoi] = await Promise.all([env.GOVERNANCE.get("toi"), env.GOVERNANCE.get("otoi")]);
      const harness = new AsfdkHarness({
        toiContent: kvToi ?? env.ASFDK_TOI_CONTENT,
        otoiContent: kvOtoi ?? env.ASFDK_OTOI_CONTENT,
      });
      await harness.start();
      return harness;
    })();
  }

  return mcpHarnessPromise;
}

// Stateless Streamable HTTP requires a fresh server + transport per request;
// the SDK throws "Stateless transport cannot be reused across requests" otherwise.
// Only the harness (expensive ASFDK init) is memoized and shared.
async function handleMcpRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const server = createMcpServer(await getMcpHarness(env));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  // Do not close() here: handleRequest returns a streamed Response whose body is
  // still being produced after this returns. Closing would abort the stream and
  // truncate the body. The per-request server/transport are GC'd once the
  // response completes.
  return transport.handleRequest(request);
}

/**
 * /mcp — reached only with a valid OAuth access token (or the legacy static
 * token). The caller's identity is in `ctx.props` as {@link McpAuthProps}.
 */
const mcpApiHandler = {
  fetch(request: Request, env: WorkerEnv) {
    return handleMcpRequest(request, env);
  },
};

/** Everything outside /mcp: the OAuth sign-in pages, then the agent routes. */
const defaultHandler = {
  async fetch(request: Request, env: WorkerEnv) {
    const { pathname } = new URL(request.url);
    const oauthEnv = env as unknown as OAuthHandlerEnv;
    if (pathname === AUTHORIZE_PATH) return handleAuthorize(request, oauthEnv);
    if (pathname === CALLBACK_PATH) return handleCallback(request, oauthEnv);

    // The Think agent routes keep the shared-secret gate they had before OAuth.
    if (!(await staticTokenMatches(readBearerToken(request), env))) {
      return new Response("Unauthorized", { status: 401 });
    }
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<WorkerEnv>;

/**
 * One provider per origin, because the RFC 9728 resource identifier (and token
 * audience) is the absolute /mcp URL. This keeps workers.dev, preview URLs, a
 * custom domain, and `wrangler dev` on localhost working without extra config;
 * tokens issued on one origin are not accepted on another.
 */
const providers = new Map<string, OAuthProvider<WorkerEnv>>();

function getOAuthProvider(origin: string): OAuthProvider<WorkerEnv> {
  let provider = providers.get(origin);
  if (!provider) {
    const resource = `${origin}${MCP_PATH}`;
    provider = new OAuthProvider<WorkerEnv>({
      apiRoute: MCP_PATH,
      apiHandler: mcpApiHandler,
      defaultHandler,
      authorizeEndpoint: AUTHORIZE_PATH,
      tokenEndpoint: TOKEN_PATH,
      // RFC 7591 Dynamic Client Registration for clients without CIMD support.
      clientRegistrationEndpoint: REGISTER_PATH,
      // Client ID Metadata Documents (MCP 2026-07-28). Needs the
      // global_fetch_strictly_public compatibility flag in wrangler.jsonc.
      clientIdMetadataDocumentEnabled: true,
      refreshTokenTTL: MCP_REFRESH_TOKEN_TTL_SECONDS,
      resourceMetadata: {
        resource,
        resource_name: "ASFDK Harness MCP",
      },
      // Transitional: existing clients configured with ASFDK_API_TOKEN keep
      // working on /mcp. Delete that secret to make /mcp OAuth-only (note it
      // also gates /agents/*).
      resolveExternalToken: async ({ token, env }) => {
        if (!(await staticTokenMatches(token, env))) return null;
        const props: McpAuthProps = { sub: "asfdk-api-token", authMethod: "static-token" };
        return { props, audience: resource };
      },
    });
    providers.set(origin, provider);
  }
  return provider;
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return getOAuthProvider(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;
