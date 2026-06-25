import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AsfdkHarness } from "./harness.js";
import { formatPolicyContext, reviewToolCall } from "./policy.js";
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

  pi.on("before_agent_start", async (event) => {
    const protocols = await harness.protocolSnapshot(event.systemPromptOptions.cwd);
    const assessment = await harness.assessText(event.prompt, {
      source: "pi.before_agent_start",
      cwd: event.systemPromptOptions.cwd,
      selectedTools: event.systemPromptOptions.selectedTools,
      protocols,
    });
    const protocolSystemPrompt = await harness.protocolSystemPrompt(event.systemPromptOptions.cwd);

    return {
      message: {
        customType: "asfdk-preflight",
        content: formatPolicyContext(assessment),
        display: false,
        details: assessment,
      },
      systemPrompt: `${event.systemPrompt}\n\n${protocolSystemPrompt}\n\nASFDK Solidarity Layer is active. Honor user Terms of Interaction, avoid provider lock-in, and treat ASFDK preflight messages as governance context for the current turn.`,
    };
  });

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
      const assessment = await harness.assessText(args, { source: "pi.command" });
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
}

export { AsfdkHarness } from "./harness.js";
export { createAsfdkTools } from "./tools.js";
export { reviewToolCall } from "./policy.js";
export { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./mcp-server.js";
export {
  createProtocolSnapshot,
  formatProtocolSystemPrompt,
  loadGovernanceProtocols,
} from "./protocols.js";
export type {
  GovernanceProtocolContext,
  GovernanceProtocolSnapshot,
  IntegrationProtocol,
  ProtocolLoadOptions,
} from "./protocols.js";
