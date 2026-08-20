#!/usr/bin/env node
/**
 * A2A-to-OpenCode Translation Proxy
 *
 * Accepts A2A-format requests from discovery hub agents and translates
 * them into OpenCode's native API format.
 *
 * Agents send structured A2A requests → Proxy translates → OpenCode processes
 *
 * Endpoints:
 *   POST /a2a/task          — Submit a task (A2A format)
 *   GET  /a2a/tasks/:id     — Check task status
 *   GET  /a2a/tasks         — List recent tasks
 *   POST /a2a/inbound       — Receive A2A messages from hub routing
 *   GET  /health            — Health check
 *
 * Environment:
 *   OPENCODE_URL  — OpenCode server URL (default: http://127.0.0.1:4096)
 *   HUB_URL       — Discovery hub URL (default: http://127.0.0.1:3001)
 *   PROXY_PORT    — Port to listen on (default: 4097)
 *   PROXY_HOST    — Host to bind to (default: 127.0.0.1)
 *   AGENT_ID      — Agent ID for hub registration (default: a2a-opencode-proxy)
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://127.0.0.1:4096";
const OPENCODE_BIN = process.env.OPENCODE_BIN ?? "opencode";
const HUB_URL = process.env.HUB_URL ?? "http://127.0.0.1:3001";
const PROXY_PORT = Number(process.env.PROXY_PORT ?? "4097");
const PROXY_HOST = process.env.PROXY_HOST ?? "127.0.0.1";
const AGENT_ID = process.env.AGENT_ID ?? "a2a-opencode-proxy";

// ---------------------------------------------------------------------------
// Task store (in-memory)
// ---------------------------------------------------------------------------

interface PendingTask {
  id: string;
  from: string;
  to: string;
  action: string;
  payload: Record<string, unknown>;
  priority: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  opencodeSessionId?: string;
  result?: unknown;
  error?: string;
}

const tasks = new Map<string, PendingTask>();

// ---------------------------------------------------------------------------
// A2A → OpenCode translation
// ---------------------------------------------------------------------------

function mapAgentToOpenCode(agentId: string | undefined): string {
  // Map A2A agent IDs to OpenCode agent names
  const agentMap: Record<string, string> = {
    "ai-cto-agent": "ai_cto_agent",
    "ai_cofounder_agent": "ai_cofounder_agent",
    "ai_product_manager": "ai_product_manager",
    "ai_rd": "ai_rd",
    "ai_marketing_manager": "ai_marketing_manager",
    "ai_customer_success": "ai_customer_success",
    "ai_operations_manager": "ai_operations_manager",
    "ai_executive_assistant": "ai_executive_assistant",
    "a2a-opencode-proxy": "build",
    // Default fallback
    "default": "build",
  };
  
  if (!agentId) return "build";
  return agentMap[agentId] ?? "build";
}

function translateA2AToOpenCode(task: PendingTask): string {
  const { action, payload, from, priority } = task;

  // Build a natural language prompt from the structured A2A payload
  const parts: string[] = [];

  parts.push(`[A2A Task from ${from}]`);
  parts.push(`Action: ${action}`);
  parts.push(`Priority: ${priority}`);

  if (payload) {
    if (payload.target_repo) {
      parts.push(`Target repository: ${payload.target_repo}`);
    }

    if (payload.spec && typeof payload.spec === "object") {
      const spec = payload.spec as Record<string, unknown>;
      parts.push(`Specification:`);
      for (const [key, value] of Object.entries(spec)) {
        parts.push(`  - ${key}: ${value}`);
      }
    }

    if (payload.canonical_reference) {
      parts.push(`Reference: ${payload.canonical_reference}`);
    }

    if (payload.deployment_path) {
      parts.push(`Deployment path: ${payload.deployment_path}`);
    }

    if (payload.description) {
      parts.push(`Description: ${payload.description}`);
    }

    if (payload.code) {
      parts.push(`Code:\n${payload.code}`);
    }

    if (payload.message) {
      parts.push(`Message: ${payload.message}`);
    }

    // Include any other payload fields
    const handled = new Set(["target_repo", "spec", "canonical_reference", "deployment_path", "description", "code", "message"]);
    for (const [key, value] of Object.entries(payload)) {
      if (!handled.has(key)) {
        parts.push(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
      }
    }
  }

  return parts.join("\n");
}

async function submitToOpenCodeWithAgent(prompt: string, agent: string): Promise<{ sessionId: string }> {
  // Use opencode run --attach with --agent flag to trigger actual agent processing
  // The --agent flag is required — without it, the server creates an empty session
  return new Promise((resolve, reject) => {
    const proc = spawn(OPENCODE_BIN, [
      "run", "--attach", OPENCODE_URL, "--agent", agent, "--format", "json"
    ], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let sessionId = "";

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Parse JSON events as they arrive
      const lines = chunk.split("\n");
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.sessionID) {
            sessionId = event.sessionID;
          }
        } catch {
          // Not JSON, skip
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (sessionId) {
        resolve({ sessionId });
      } else {
        reject(new Error(`OpenCode run failed (exit ${code}). stdout: ${stdout.slice(0, 500)} stderr: ${stderr.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn opencode: ${err.message}`));
    });

    // Send the prompt via stdin
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// Keep the old function for backward compatibility
async function submitToOpenCode(prompt: string): Promise<{ sessionId: string }> {
  return submitToOpenCodeWithAgent(prompt, "build");
}

// ---------------------------------------------------------------------------
// Hub Registration
// ---------------------------------------------------------------------------

async function registerWithHub(): Promise<void> {
  const agentCard = {
    id: AGENT_ID,
    name: "A2A OpenCode Proxy",
    description: "Translates A2A messages into OpenCode agent tasks. Routes messages to OpenCode's build agent for execution.",
    url: `http://${PROXY_HOST}:${PROXY_PORT}/a2a/inbound`,
    version: "1.0.0",
    capabilities: {
      formats: ["a2a", "opencode"],
      agents: ["build"],
      actions: ["EXECUTE", "ANALYZE", "REVIEW"],
    },
    governance: {
      framework: "solidarity",
      compliance: ["otoi", "toi"],
    },
  };

  try {
    const response = await fetch(`${HUB_URL}/a2a/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agentCard),
    });
    
    if (response.ok) {
      console.log(`[a2a-proxy] Registered with hub at ${HUB_URL}`);
    } else {
      console.error(`[a2a-proxy] Hub registration failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.error(`[a2a-proxy] Hub registration error: ${error instanceof Error ? error.message : error}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

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
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${PROXY_HOST}:${PROXY_PORT}`}`);
    const path = url.pathname;

    try {
      // --- Health check ---
      if (path === "/health" && req.method === "GET") {
        jsonResponse(res, 200, {
          status: "ok",
          proxy: "a2a-opencode-proxy",
          opencodeUrl: OPENCODE_URL,
          hubUrl: HUB_URL,
          agentId: AGENT_ID,
          pendingTasks: Array.from(tasks.values()).filter((t) => t.status === "pending").length,
          totalTasks: tasks.size,
        });
        return;
      }

      // --- Inbound A2A messages from hub ---
      if (path === "/a2a/inbound" && req.method === "POST") {
        const body = (await readJsonBody(req)) as Record<string, unknown> | undefined;
        if (!body || typeof body !== "object") {
          jsonResponse(res, 400, { error: "Request body must be a JSON object" });
          return;
        }

        // Get target agent from header (set by hub for in-memory agents)
        const targetAgent = req.headers["x-a2a-target-agent"] as string | undefined;
        const fromAgent = (body.from as string) ?? "unknown";

        console.log(`[a2a-proxy] Received inbound message from ${fromAgent} (target: ${targetAgent ?? "default"})`);

        // Create a task from the inbound message
        const task: PendingTask = {
          id: randomUUID(),
          from: fromAgent,
          to: targetAgent ?? AGENT_ID,
          action: (body.type as string) ?? "message",
          payload: (body.payload as Record<string, unknown>) ?? {},
          priority: "NORMAL",
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        tasks.set(task.id, task);

        // Process asynchronously
        task.status = "processing";
        task.updatedAt = new Date().toISOString();

        const prompt = translateA2AToOpenCode(task);
        
        // Determine which OpenCode agent to use based on target
        const openCodeAgent = mapAgentToOpenCode(targetAgent);
        
        submitToOpenCodeWithAgent(prompt, openCodeAgent)
          .then(({ sessionId }) => {
            task.status = "completed";
            task.opencodeSessionId = sessionId;
            task.updatedAt = new Date().toISOString();
            console.log(`[a2a-proxy] Task ${task.id} completed: ${sessionId}`);
          })
          .catch((error) => {
            task.status = "failed";
            task.error = error instanceof Error ? error.message : String(error);
            task.updatedAt = new Date().toISOString();
            console.error(`[a2a-proxy] Task ${task.id} failed: ${task.error}`);
          });

        // Return immediately with task ID
        jsonResponse(res, 202, {
          success: true,
          taskId: task.id,
          status: "processing",
          message: "Task accepted and processing. Poll /a2a/tasks/:id for status.",
        });
        return;
      }

      // --- Submit A2A task ---
      if (path === "/a2a/task" && req.method === "POST") {
        const body = (await readJsonBody(req)) as Record<string, unknown> | undefined;
        if (!body || typeof body !== "object") {
          jsonResponse(res, 400, { error: "Request body must be a JSON object" });
          return;
        }

        const task: PendingTask = {
          id: randomUUID(),
          from: (body.from as string) ?? "unknown",
          to: (body.to as string) ?? "opencode",
          action: (body.action as string) ?? "EXECUTE",
          payload: (body.payload as Record<string, unknown>) ?? {},
          priority: (body.priority as string) ?? "NORMAL",
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        tasks.set(task.id, task);

        // Translate and submit to OpenCode
        try {
          task.status = "processing";
          task.updatedAt = new Date().toISOString();

          const prompt = translateA2AToOpenCode(task);
          const { sessionId } = await submitToOpenCode(prompt);

          task.status = "completed";
          task.opencodeSessionId = sessionId;
          task.updatedAt = new Date().toISOString();

          jsonResponse(res, 202, {
            success: true,
            taskId: task.id,
            opencodeSessionId: sessionId,
            status: "submitted",
            message: "Task submitted to OpenCode. Check /a2a/tasks/:id for status.",
          });
        } catch (error) {
          task.status = "failed";
          task.error = error instanceof Error ? error.message : String(error);
          task.updatedAt = new Date().toISOString();

          jsonResponse(res, 502, {
            success: false,
            taskId: task.id,
            error: task.error,
          });
        }
        return;
      }

      // --- Get task status ---
      const taskMatch = path.match(/^\/a2a\/tasks\/(.+)$/);
      if (taskMatch && req.method === "GET") {
        const task = tasks.get(taskMatch[1]);
        if (!task) {
          jsonResponse(res, 404, { error: "Task not found", taskId: taskMatch[1] });
          return;
        }
        jsonResponse(res, 200, { task });
        return;
      }

      // --- List tasks ---
      if (path === "/a2a/tasks" && req.method === "GET") {
        const allTasks = Array.from(tasks.values()).map((t) => ({
          id: t.id,
          from: t.from,
          action: t.action,
          status: t.status,
          priority: t.priority,
          createdAt: t.createdAt,
          opencodeSessionId: t.opencodeSessionId,
        }));
        jsonResponse(res, 200, { count: allTasks.length, tasks: allTasks });
        return;
      }

      // --- 404 ---
      jsonResponse(res, 404, { error: "Not found", path });
    } catch (error) {
      console.error(`[a2a-proxy] Request error:`, error);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: "Internal server error" });
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    }
  });

  server.listen(PROXY_PORT, PROXY_HOST, async () => {
    console.log(`[a2a-proxy] A2A-to-OpenCode proxy started at http://${PROXY_HOST}:${PROXY_PORT}`);
    console.log(`[a2a-proxy] OpenCode target: ${OPENCODE_URL}`);
    console.log(`[a2a-proxy] Hub URL: ${HUB_URL}`);
    console.log(`[a2a-proxy] Agent ID: ${AGENT_ID}`);
    console.log(`[a2a-proxy] Inbound endpoint: POST http://${PROXY_HOST}:${PROXY_PORT}/a2a/inbound`);
    console.log(`[a2a-proxy] Submit tasks: POST http://${PROXY_HOST}:${PROXY_PORT}/a2a/task`);
    console.log(`[a2a-proxy] Check status: GET  http://${PROXY_HOST}:${PROXY_PORT}/a2a/tasks/:id`);

    // Register with hub
    await registerWithHub();
  });

  const shutdown = async () => {
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run if executed directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[a2a-proxy] Fatal error:", error);
    process.exit(1);
  });
}

export { translateA2AToOpenCode, tasks };
