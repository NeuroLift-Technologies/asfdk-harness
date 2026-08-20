#!/usr/bin/env node
/**
 * ASFDK A2A Discovery Hub
 *
 * Central registry where governed agents register their A2A Agent Cards
 * and discover each other. Exposes both MCP tools and REST endpoints.
 *
 * MCP Tools:   register_agent, deregister_agent, list_agents, get_agent
 * REST:        POST /a2a/register, GET /a2a/agents, GET /a2a/agents/:id, DELETE /a2a/agents/:id, GET /health
 * MCP:         POST /mcp (Streamable HTTP)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STATE_FILE = process.env.ASFDK_HUB_STATE_FILE
  ?? path.join(process.cwd(), ".asfdk-hub-state.json");

// Message retention: max messages and TTL in milliseconds (default: 1000 messages, 7 days)
const MAX_MESSAGES = Number(process.env.ASFDK_HUB_MAX_MESSAGES ?? "1000");
const MESSAGE_TTL_MS = Number(process.env.ASFDK_HUB_MESSAGE_TTL_MS ?? String(7 * 24 * 60 * 60 * 1000));

interface PersistedMessage {
  id: string;
  from: string;
  to: string;
  type: "task" | "message" | "event";
  payload: Record<string, unknown>;
  timestamp: string;
  replyTo?: string;
  delivered: boolean;
  deliveredAt?: string;
}

interface PersistedState {
  agents: [string, RegisteredAgent][];
  stats: HubStats;
  messages: PersistedMessage[];
}

function saveState() {
  try {
    const state: PersistedState = {
      agents: Array.from(agents.entries()),
      stats,
      messages,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error(`[discovery-hub] Failed to persist state:`, err);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log(`[discovery-hub] No state file found at ${STATE_FILE} — starting fresh`);
      return;
    }
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const state: PersistedState = JSON.parse(raw);
    if (Array.isArray(state.agents)) {
      for (const [id, agent] of state.agents) {
        agents.set(id, agent);
      }
    }
    if (Array.isArray(state.messages)) {
      for (const msg of state.messages) {
        messages.push(msg);
      }
    }
    if (state.stats) {
      stats = { ...stats, ...state.stats, startedAt: new Date().toISOString() };
    }
    console.log(`[discovery-hub] Loaded ${agents.size} agent(s), ${messages.length} message(s) from ${STATE_FILE}`);
  } catch (err) {
    console.error(`[discovery-hub] Failed to load state from ${STATE_FILE}:`, err);
    console.log(`[discovery-hub] Starting with empty registry`);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisteredAgent {
  id: string;
  name: string;
  description: string;
  url: string;          // Agent's actual endpoint (if any) for receiving A2A messages
  hubUrl: string;       // Hub-generated URL for this agent (http://hub/a2a/agents/:id)
  version: string;
  agentCard: Record<string, unknown>;
  registeredAt: string;
  lastSeen: string;
  capabilities?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  transport: "http" | "stdio" | "in-memory";  // How to reach this agent
}

interface A2AMessage {
  id: string;
  from: string;
  to: string;
  type: "task" | "message" | "event";
  payload: Record<string, unknown>;
  timestamp: string;
  replyTo?: string;
}

interface A2AResponse {
  id: string;
  messageId: string;
  from: string;
  to: string;
  status: "success" | "error" | "timeout" | "not_found";
  payload?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

interface HubStats {
  totalRegistrations: number;
  totalDeregistrations: number;
  uptime: string;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// In-memory agent registry + message inbox
// ---------------------------------------------------------------------------

const agents = new Map<string, RegisteredAgent>();
const messages: PersistedMessage[] = [];
const messageIndex = new Map<string, number>(); // messageId → index in messages array
let stats: HubStats = {
  totalRegistrations: 0,
  totalDeregistrations: 0,
  uptime: "0s",
  startedAt: new Date().toISOString(),
};

function updateUptime() {
  const elapsed = Date.now() - new Date(stats.startedAt).getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function registerAgent(data: Record<string, unknown>): RegisteredAgent {
  const id = (data.id as string) ?? (data.agentId as string) ?? randomUUID();
  const now = new Date().toISOString();
  const hubUrl = `http://${HUB_HOST}:${HUB_PORT}/a2a/agents/${id}`;

  // Determine transport type based on whether agent has its own URL
  const agentUrl = (data.url as string) ?? "";
  let transport: RegisteredAgent["transport"] = "in-memory";
  if (agentUrl) {
    transport = "http";
  } else if (data.transport === "stdio") {
    transport = "stdio";
  }

  const agent: RegisteredAgent = {
    id,
    name: (data.name as string) ?? id,
    description: (data.description as string) ?? "",
    url: agentUrl,
    hubUrl,
    version: (data.version as string) ?? "0.0.0",
    agentCard: data,
    registeredAt: agents.get(id)?.registeredAt ?? now,
    lastSeen: now,
    capabilities: data.capabilities as Record<string, unknown> | undefined,
    governance: data.governance as Record<string, unknown> | undefined,
    transport,
  };

  agents.set(id, agent);
  stats.totalRegistrations++;
  saveState();
  return agent;
}

function deregisterAgent(id: string): boolean {
  if (!agents.has(id)) return false;
  agents.delete(id);
  stats.totalDeregistrations++;
  saveState();
  return true;
}

function storeMessage(msg: PersistedMessage) {
  messages.push(msg);
  messageIndex.set(msg.id, messages.length - 1);
  // Enforce retention: remove messages older than TTL
  const now = Date.now();
  const cutoff = now - MESSAGE_TTL_MS;
  while (messages.length > 0 && new Date(messages[0].timestamp).getTime() < cutoff) {
    const removed = messages.shift()!;
    messageIndex.delete(removed.id);
  }
  // Enforce max count: keep only the most recent messages
  while (messages.length > MAX_MESSAGES) {
    const removed = messages.shift()!;
    messageIndex.delete(removed.id);
  }
  // Rebuild index after shifts
  messageIndex.clear();
  for (let i = 0; i < messages.length; i++) {
    messageIndex.set(messages[i].id, i);
  }
  saveState();
}

function markDelivered(messageId: string): void {
  const idx = messageIndex.get(messageId);
  if (idx !== undefined && idx < messages.length) {
    messages[idx].delivered = true;
    messages[idx].deliveredAt = new Date().toISOString();
    saveState();
  }
}

function getInbox(agentId: string): PersistedMessage[] {
  return messages.filter((m) => m.to === agentId);
}

function getAllMessages(limit = 100): PersistedMessage[] {
  return messages.slice(-limit);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

function createHubMcpServer(): McpServer {
  const server = new McpServer({
    name: "asfdk-discovery-hub",
    version: "1.0.0",
  });

  // Tool: register_agent
  server.registerTool(
    "register_agent",
    {
      title: "Register Agent",
      description: `Register an agent's A2A Agent Card with the discovery hub.

The agent card should follow the A2A protocol specification with at minimum:
  - id: unique agent identifier
  - name: human-readable name
  - url: service endpoint URL
  - description: what the agent does

Optionally include:
  - version, capabilities, governance, skills, interopProtocols

Returns the registered agent record with timestamps.`,
      inputSchema: {
        agentCard: z.record(z.string(), z.unknown()).describe("The full A2A Agent Card object to register"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentCard }) => {
      try {
        const agent = registerAgent(agentCard);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, agent }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // Tool: deregister_agent
  server.registerTool(
    "deregister_agent",
    {
      title: "Deregister Agent",
      description: `Remove an agent from the discovery hub registry.

Returns success/failure and the ID of the removed agent.`,
      inputSchema: {
        agentId: z.string().describe("The unique ID of the agent to deregister"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentId }) => {
      const removed = deregisterAgent(agentId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: removed,
            agentId,
            message: removed ? "Agent deregistered" : "Agent not found",
          }, null, 2),
        }],
        isError: !removed,
      };
    }
  );

  // Tool: list_agents
  server.registerTool(
    "list_agents",
    {
      title: "List Agents",
      description: `List all agents registered with the discovery hub.

Returns an array of agent records with IDs, names, URLs, and registration timestamps.
Optionally filter by tag or capability.`,
      inputSchema: {
        filter: z.string().optional().describe("Optional: filter agents by name or description substring (case-insensitive)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ filter }) => {
      let agentList = Array.from(agents.values());

      if (filter) {
        const lower = filter.toLowerCase();
        agentList = agentList.filter(
          (a) =>
            a.name.toLowerCase().includes(lower) ||
            a.description.toLowerCase().includes(lower) ||
            a.id.toLowerCase().includes(lower)
        );
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: agentList.length,
            agents: agentList.map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              url: a.url,
              version: a.version,
              registeredAt: a.registeredAt,
              lastSeen: a.lastSeen,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // Tool: get_agent
  server.registerTool(
    "get_agent",
    {
      title: "Get Agent",
      description: `Get full details for a specific registered agent including their complete Agent Card.

Returns the full agent record or an error if not found.`,
      inputSchema: {
        agentId: z.string().describe("The unique ID of the agent to retrieve"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentId }) => {
      const agent = agents.get(agentId);
      if (!agent) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Agent not found",
              agentId,
            }),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ agent }, null, 2),
        }],
      };
    }
  );

  // Tool: hub_status
  server.registerTool(
    "hub_status",
    {
      title: "Hub Status",
      description: `Get the discovery hub's current status including uptime, registration counts, and health.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "ok",
            uptime: updateUptime(),
            startedAt: stats.startedAt,
            registeredAgents: agents.size,
            totalRegistrations: stats.totalRegistrations,
            totalDeregistrations: stats.totalDeregistrations,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: get_inbox
  server.registerTool(
    "get_inbox",
    {
      title: "Get Agent Inbox",
      description: `Get all messages for a specific agent from the hub inbox.

Returns messages sent to the agent, including delivery status.
The callerId must match the agentId unless ASFDK_HUB_ADMIN_MODE=true.`,
      inputSchema: {
        agentId: z.string().describe("The unique ID of the agent whose inbox to retrieve"),
        callerId: z.string().optional().describe("The unique ID of the requesting agent (must match agentId unless admin mode)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentId, callerId }) => {
      if (!HUB_ADMIN_MODE && callerId && callerId !== agentId) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Access denied: callerId does not match agentId and admin mode is disabled" }, null, 2),
          }],
        };
      }
      const agentInbox = getInbox(agentId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            agentId,
            count: agentInbox.length,
            messages: agentInbox,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: list_messages
  server.registerTool(
    "list_messages",
    {
      title: "List All Messages",
      description: `List all messages across all agents (admin view).

Requires ASFDK_HUB_ADMIN_MODE=true to use.`,
      inputSchema: {
        limit: z.number().optional().describe("Maximum number of messages to return (default: 100)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      if (!HUB_ADMIN_MODE) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Access denied: ASFDK_HUB_ADMIN_MODE is not enabled" }, null, 2),
          }],
        };
      }
      const allMessages = getAllMessages(limit ?? 100);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: allMessages.length,
            messages: allMessages,
          }, null, 2),
        }],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// HTTP Server (REST + MCP)
// ---------------------------------------------------------------------------

const HUB_HOST = process.env.ASFDK_A2A_HOST ?? "127.0.0.1";
const HUB_PORT = Number(process.env.ASFDK_A2A_PORT ?? "3001");
const MCP_PATH = "/mcp";
const HUB_ADMIN_MODE = process.env.ASFDK_HUB_ADMIN_MODE === "true";

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

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data, null, 2));
}

async function main() {
  loadState();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${HUB_HOST}:${HUB_PORT}`}`);
    const path = url.pathname;

    try {
      // --- MCP endpoint (Streamable HTTP, stateless mode) ---
      // Per the MCP SDK's stateless pattern, each POST request must use a
      // fresh transport (and fresh server) — a cached transport throws
      // "Stateless transport cannot be reused across requests" on the 2nd request.
      if (path === MCP_PATH) {
        if (req.method === "POST") {
          const mcpServer = createHubMcpServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          try {
            await mcpServer.connect(transport);
            const body = await readJsonBody(req);
            console.log(`[discovery-hub] MCP request (POST):`, JSON.stringify(body ?? {}).substring(0, 200));
            await transport.handleRequest(req as http.IncomingMessage & { auth?: AuthInfo }, res, body);
            console.log(`[discovery-hub] MCP response sent (POST)`);
          } finally {
            // Stateless: tear down the transport when the response closes.
            res.on("close", () => {
              transport.close().catch(() => {});
              mcpServer.close().catch(() => {});
            });
          }
        } else if (req.method === "GET" || req.method === "DELETE") {
          // Stateless mode does not support long-lived SSE streams.
          jsonResponse(res, 405, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed. This stateless endpoint accepts POST only." },
            id: null,
          });
        } else {
          jsonResponse(res, 405, { error: "Method not allowed", path, method: req.method });
        }
        return;
      }

      // --- Health check ---
      if (path === "/health" && req.method === "GET") {
        jsonResponse(res, 200, {
          status: "ok",
          hub: "asfdk-discovery-hub",
          version: "1.0.0",
          uptime: updateUptime(),
          registeredAgents: agents.size,
        });
        return;
      }

      // --- OpenCode-compatible: List agents (no /a2a prefix) ---
      if (path === "/agents" && req.method === "GET") {
        const agentList = Array.from(agents.values()).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          url: a.url,
          hubUrl: a.hubUrl,
          transport: a.transport,
          version: a.version,
          registeredAt: a.registeredAt,
          lastSeen: a.lastSeen,
        }));
        jsonResponse(res, 200, { count: agentList.length, agents: agentList });
        return;
      }

      // --- OpenCode-compatible: Get agent tasks (polling endpoint) ---
      const agentTasksMatch = path.match(/^\/agents\/(.+)\/tasks$/);
      if (agentTasksMatch && req.method === "GET") {
        const agentId = agentTasksMatch[1];
        const agent = agents.get(agentId);
        
        if (!agent) {
          jsonResponse(res, 404, { error: "Agent not found", agentId });
          return;
        }

        // Return empty tasks array - tasks are routed immediately via /a2a/message
        // This endpoint exists for OpenCode task-watch compatibility
        jsonResponse(res, 200, { 
          agentId,
          tasks: [],
          message: "Tasks are routed immediately via POST /a2a/message. No pending queue."
        });
        return;
      }

      // --- OpenCode-compatible: Get agent ---
      const agentCompatMatch = path.match(/^\/agents\/(.+)$/);
      if (agentCompatMatch && req.method === "GET" && !path.includes("/tasks")) {
        const agentId = agentCompatMatch[1];
        const agent = agents.get(agentId);
        
        if (!agent) {
          jsonResponse(res, 404, { error: "Agent not found", agentId });
          return;
        }

        jsonResponse(res, 200, { agent });
        return;
      }

      // --- REST: List agents ---
      if (path === "/a2a/agents" && req.method === "GET") {
        const agentList = Array.from(agents.values()).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          url: a.url,
          hubUrl: a.hubUrl,
          transport: a.transport,
          version: a.version,
          registeredAt: a.registeredAt,
          lastSeen: a.lastSeen,
        }));
        jsonResponse(res, 200, { count: agentList.length, agents: agentList });
        return;
      }

      // --- REST: Get single agent ---
      const agentMatch = path.match(/^\/a2a\/agents\/(.+)$/);
      if (agentMatch && req.method === "GET") {
        const agent = agents.get(agentMatch[1]);
        if (!agent) {
          jsonResponse(res, 404, { error: "Agent not found", id: agentMatch[1] });
          return;
        }
        jsonResponse(res, 200, { 
          agent: {
            ...agent,
            hubUrl: agent.hubUrl,
            transport: agent.transport,
          }
        });
        return;
      }

      // --- REST: Delete agent ---
      if (agentMatch && req.method === "DELETE") {
        const removed = deregisterAgent(agentMatch[1]);
        if (!removed) {
          jsonResponse(res, 404, { error: "Agent not found", id: agentMatch[1] });
          return;
        }
        jsonResponse(res, 200, { success: true, id: agentMatch[1] });
        return;
      }

      // --- REST: Register agent ---
      if (path === "/a2a/register" && req.method === "POST") {
        const body = (await readJsonBody(req)) as Record<string, unknown> | undefined;
        if (!body || typeof body !== "object") {
          jsonResponse(res, 400, { error: "Request body must be a JSON object (A2A Agent Card)" });
          return;
        }
        const agent = registerAgent(body);
        jsonResponse(res, 201, { success: true, agent });
        return;
      }

      // --- REST: Route A2A message to target agent ---
      if (path === "/a2a/message" && req.method === "POST") {
        const body = (await readJsonBody(req)) as Record<string, unknown> | undefined;
        if (!body || typeof body !== "object") {
          jsonResponse(res, 400, { error: "Request body must be a JSON object" });
          return;
        }

        const toId = body.to as string;
        const fromId = body.from as string;
        const payload = body.payload as Record<string, unknown> | undefined;
        const msgType = (body.type as string) ?? "message";

        if (!toId) {
          jsonResponse(res, 400, { error: "Missing 'to' field (target agent ID)" });
          return;
        }

        const targetAgent = agents.get(toId);
        if (!targetAgent) {
          jsonResponse(res, 404, { 
            error: "Target agent not found", 
            to: toId,
            hint: "Agent not registered with hub. Use POST /a2a/register first." 
          });
          return;
        }

        // Build the A2A message
        const message: A2AMessage = {
          id: crypto.randomUUID(),
          from: fromId ?? "unknown",
          to: toId,
          type: msgType as A2AMessage["type"],
          payload: payload ?? {},
          timestamp: new Date().toISOString(),
          replyTo: body.replyTo as string | undefined,
        };

        console.log(`[discovery-hub] Routing message: ${message.from} → ${message.to} (${targetAgent.name}, transport: ${targetAgent.transport})`);

        // Store in inbox
        storeMessage({ ...message, delivered: false });
        // Route based on transport type
        if (targetAgent.transport === "http" && targetAgent.url) {
          // HTTP agent: forward to their endpoint
          try {
            const agentUrl = new URL(targetAgent.url);
            const response = await fetch(agentUrl.toString(), {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "X-A2A-From": message.from,
                "X-A2A-Message-ID": message.id,
              },
              body: JSON.stringify(message),
              signal: AbortSignal.timeout(30000),
            });

            const responseData = await response.json() as Record<string, unknown>;
            targetAgent.lastSeen = new Date().toISOString();
            // Mark delivered (consolidated save)
            markDelivered(message.id);

            const a2aResponse: A2AResponse = {
              id: crypto.randomUUID(),
              messageId: message.id,
              from: toId,
              to: message.from,
              status: response.ok ? "success" : "error",
              payload: responseData,
              error: response.ok ? undefined : `Agent returned ${response.status}`,
              timestamp: new Date().toISOString(),
            };

            jsonResponse(res, response.ok ? 200 : 502, a2aResponse);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[discovery-hub] HTTP routing failed: ${errMsg}`);
            
            const a2aResponse: A2AResponse = {
              id: crypto.randomUUID(),
              messageId: message.id,
              from: toId,
              to: message.from,
              status: "error",
              error: `Failed to reach agent: ${errMsg}`,
              timestamp: new Date().toISOString(),
            };
            jsonResponse(res, 502, a2aResponse);
          }
        } else if (targetAgent.transport === "in-memory" || !targetAgent.url) {
          // In-memory agent: route through the A2A proxy
          // The proxy handles OpenCode integration
          const proxyUrl = "http://127.0.0.1:4097/a2a/inbound";
          
          try {
            const response = await fetch(proxyUrl, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "X-A2A-From": message.from,
                "X-A2A-Message-ID": message.id,
                "X-A2A-Target-Agent": toId,
              },
              body: JSON.stringify(message),
              signal: AbortSignal.timeout(60000), // 60s for OpenCode processing
            });

            const responseData = await response.json() as Record<string, unknown>;
            targetAgent.lastSeen = new Date().toISOString();
            // Mark delivered (consolidated save)
            markDelivered(message.id);

            const a2aResponse: A2AResponse = {
              id: crypto.randomUUID(),
              messageId: message.id,
              from: toId,
              to: message.from,
              status: response.ok ? "success" : "error",
              payload: responseData,
              error: response.ok ? undefined : `Proxy returned ${response.status}`,
              timestamp: new Date().toISOString(),
            };

            jsonResponse(res, response.ok ? 200 : 502, a2aResponse);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[discovery-hub] Proxy routing failed: ${errMsg}`);
            
            const a2aResponse: A2AResponse = {
              id: crypto.randomUUID(),
              messageId: message.id,
              from: toId,
              to: message.from,
              status: "error",
              error: `Failed to reach proxy: ${errMsg}`,
              timestamp: new Date().toISOString(),
            };
            jsonResponse(res, 502, a2aResponse);
          }
        } else {
          // Stdio or unknown transport
          jsonResponse(res, 400, {
            error: "Agent transport does not support HTTP messaging",
            to: toId,
            agent: targetAgent.name,
            transport: targetAgent.transport,
          });
        }
        return;
      }

      // --- REST: Get inbox for specific agent ---
      const inboxMatch = path.match(/^\/a2a\/inbox\/(.+)$/);
      if (inboxMatch && req.method === "GET") {
        const agentId = inboxMatch[1];
        const callerId = url.searchParams.get("callerId");
        if (!HUB_ADMIN_MODE && callerId && callerId !== agentId) {
          jsonResponse(res, 403, { error: "Access denied: callerId does not match agentId and admin mode is disabled" });
          return;
        }
        const agentInbox = getInbox(agentId);
        jsonResponse(res, 200, {
          agentId,
          count: agentInbox.length,
          messages: agentInbox,
        });
        return;
      }

      // --- REST: Get all messages (admin view) ---
      if (path === "/a2a/inbox" && req.method === "GET") {
        if (!HUB_ADMIN_MODE) {
          jsonResponse(res, 403, { error: "Access denied: ASFDK_HUB_ADMIN_MODE is not enabled" });
          return;
        }
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 100)) : 100;
        const allMessages = getAllMessages(limit);
        jsonResponse(res, 200, {
          count: allMessages.length,
          messages: allMessages,
        });
        return;
      }

      // --- 404 ---
      jsonResponse(res, 404, { error: "Not found", path });
    } catch (error) {
      console.error(`[discovery-hub] Request error:`, error);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: "Internal server error" });
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    }
  });

  httpServer.listen(HUB_PORT, HUB_HOST, () => {
    console.log(`[discovery-hub] ASFDK A2A Discovery Hub started at http://${HUB_HOST}:${HUB_PORT}`);
    console.log(`[discovery-hub] MCP endpoint: http://${HUB_HOST}:${HUB_PORT}${MCP_PATH}`);
    console.log(`[discovery-hub] REST API:     http://${HUB_HOST}:${HUB_PORT}/a2a/`);
    console.log(`[discovery-hub] Health:       http://${HUB_HOST}:${HUB_PORT}/health`);
  });

  const shutdown = async () => {
    saveState();
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run if executed directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[discovery-hub] Fatal error:", error);
    process.exit(1);
  });
}

export { createHubMcpServer, registerAgent, deregisterAgent, agents, getInbox, getAllMessages, storeMessage, markDelivered };
