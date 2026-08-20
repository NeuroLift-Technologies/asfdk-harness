import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AsfdkHarness, Channel } from "./harness.js";
import { reviewToolCall } from "./policy.js";
import { createAsfdkTools } from "./tools.js";
import { getThirdPartyProtocolProfiles } from "./protocols.js";

export default function asfdkPiHarness(pi: ExtensionAPI) {
  const harness = new AsfdkHarness();

  for (const tool of createAsfdkTools(harness)) {
    pi.registerTool(tool);
  }

  pi.on("session_start", async (_event, ctx) => {
    await harness.start();
    const protocols = await harness.protocolSnapshot(ctx.cwd);
    ctx.ui.setStatus("asfdk", `ASFDK:${harness.mode}`);
    ctx.ui.notify(`ASFDK harness active (${harness.mode}); protocols: ${protocols.protocols.length}`, "info");
  });

  pi.on("session_shutdown", async () => {
    await harness.shutdown();
  });

  // before_agent_start hook DISABLED — preflight no longer runs automatically on every turn.
  // ASFDK tools remain available for on-demand use via slash commands and tool calls.
  // To re-enable, uncomment the block below.

  pi.on("tool_call", async (event) => {
    const decision = reviewToolCall(event.toolName, event.input as Record<string, unknown>);
    if (!decision.allow) {
      return { block: true, reason: decision.reason ?? "Blocked by ASFDK harness policy" };
    }
    return undefined;
  });

  pi.registerCommand("asfdk-status", {
    description: "Show ASFDK foundation status and health.",
    handler: async (_args, ctx) => {
      const [status, health] = await Promise.all([harness.status(), harness.healthCheck()]);
      ctx.ui.notify(JSON.stringify({ status, health }, null, 2), "info");
    },
  });

  pi.registerCommand("asfdk-assess", {
    description: "Assess text through ASFDK: /asfdk-assess <text>",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /asfdk-assess <text>", "warning");
        return;
      }
      const assessment = await harness.assessText(args, { source: "pi.command" }, Channel.USER_INPUT);
      ctx.ui.notify(JSON.stringify(assessment, null, 2), "info");
    },
  });

  pi.registerCommand("asfdk-protocols", {
    description: "Show ASFDK protocol status, including A2A/third-party targets and MCP exclusion.",
    handler: async (_args, ctx) => {
      const protocols = await harness.protocolSnapshot(ctx.cwd);
      ctx.ui.notify(JSON.stringify(protocols, null, 2), "info");
    },
  });

  pi.registerCommand("asfdk-interop", {
    description: "Show third-party interoperability protocol targets.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify(getThirdPartyProtocolProfiles(), null, 2), "info");
    },
  });

  pi.registerCommand("asfdk-a2a-card", {
    description: "Show the generated A2A Agent Card for the current harness state.",
    handler: async (_args, ctx) => {
      const card = await harness.a2aAgentCard(ctx.cwd);
      ctx.ui.notify(JSON.stringify(card, null, 2), "info");
    },
  });
}

export { AsfdkHarness } from "./harness.js";
export { createAsfdkTools } from "./tools.js";
export { reviewToolCall } from "./policy.js";
export { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./mcp-server.js";
export { createMcpHttpServer } from "./mcp-http-server.js";
export {
  createProtocolSnapshot,
  formatProtocolSystemPrompt,
  loadGovernanceProtocols,
} from "./protocols.js";
export { createA2AAgentCard } from "./a2a.js";
export type {
  GovernanceProtocolContext,
  GovernanceProtocolSnapshot,
  IntegrationProtocol,
  ProtocolLoadOptions,
} from "./protocols.js";
