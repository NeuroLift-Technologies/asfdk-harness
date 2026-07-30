import { routeAgentRequest } from "agents";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AsfdkHarness } from "./harness.js";
import { createMcpServer } from "./mcp-server.js";

export { AsfdkGovernanceAgent } from "../agents/asfdk-governance/agent.js";

const MCP_PATH = "/mcp";

let mcpHarnessPromise: Promise<AsfdkHarness> | undefined;

function authorizeRequest(request: Request, env: Env): string | Response {
  const expectedToken = (env as Env & { ASFDK_API_TOKEN?: string }).ASFDK_API_TOKEN;
  const authHeader = request.headers.get("Authorization") ?? "";
  const presentedToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length)
    : undefined;

  if (!expectedToken || presentedToken !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  return presentedToken;
}

async function getMcpHarness(): Promise<AsfdkHarness> {
  if (!mcpHarnessPromise) {
    mcpHarnessPromise = (async () => {
      const harness = new AsfdkHarness();
      await harness.start();
      return harness;
    })();
  }

  return mcpHarnessPromise;
}

// Stateless Streamable HTTP requires a fresh server + transport per request;
// the SDK throws "Stateless transport cannot be reused across requests" otherwise.
// Only the harness (expensive ASFDK init) is memoized and shared.
async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createMcpServer(await getMcpHarness());
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

export default {
  async fetch(request: Request, env: Env) {
    const authorized = authorizeRequest(request, env);
    if (authorized instanceof Response) {
      return authorized;
    }

    const url = new URL(request.url);
    if (url.pathname === MCP_PATH) {
      return handleMcpRequest(request);
    }

    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
