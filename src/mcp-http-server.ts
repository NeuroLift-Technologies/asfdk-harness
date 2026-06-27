#!/usr/bin/env node
/**
 * ASFDK Harness MCP HTTP Server
 *
 * Local Streamable HTTP entrypoint for MCP clients that expect a URL.
 * Reuses the same tool registry as the stdio MCP server.
 */

import http from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { AsfdkHarness } from "./harness.js";
import { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./mcp-server.js";

const MCP_HTTP_HOST = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
const MCP_HTTP_PORT = Number(process.env.MCP_HTTP_PORT ?? "8788");
const MCP_HTTP_PATH = process.env.MCP_HTTP_PATH ?? "/mcp";

async function readJsonBody(request: http.IncomingMessage): Promise<unknown | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;

  return JSON.parse(raw);
}

function createMcpHttpServer(harness: AsfdkHarness) {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${MCP_HTTP_HOST}:${MCP_HTTP_PORT}`}`);
      if (requestUrl.pathname !== MCP_HTTP_PATH) {
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("Not found");
        return;
      }

      const server = createMcpServer(harness);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);

      const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
      await transport.handleRequest(req as http.IncomingMessage & { auth?: AuthInfo }, res, parsedBody);
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(error instanceof Error ? error.message : String(error));
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    }
  });
}

async function main() {
  const harness = new AsfdkHarness();

  try {
    await harness.start();

    const server = createMcpHttpServer(harness);
    server.listen(MCP_HTTP_PORT, MCP_HTTP_HOST, () => {
      console.error(
        `[${MCP_SERVER_NAME}] MCP HTTP server started (version ${MCP_SERVER_VERSION}) at http://${MCP_HTTP_HOST}:${MCP_HTTP_PORT}${MCP_HTTP_PATH}`
      );
      console.error(`[${MCP_SERVER_NAME}] ASFDK foundation initialised in ${harness.mode} mode`);
    });

    const shutdown = async () => {
      server.close();
      await harness.shutdown();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(`[${MCP_SERVER_NAME}] MCP HTTP startup error:`, error);
    await harness.shutdown();
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[${MCP_SERVER_NAME}] MCP HTTP fatal error:`, error);
    process.exit(1);
  });
}

export { createMcpHttpServer };
