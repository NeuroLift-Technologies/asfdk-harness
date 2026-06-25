#!/usr/bin/env node
/**
 * ASFDK Harness MCP Server
 * 
 * Exposes ASFDK governance tools via Model Context Protocol (MCP)
 * Allows any MCP-compatible client to use ASFDK's Solidarity Framework capabilities
 */

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AsfdkHarness } from "./harness.js";
import { summarizeFoundationResponse } from "./harness.js";
import { reviewToolCall, type ToolPolicyDecision } from "./policy.js";
import { InteractionType } from "@neurolift-technologies/asfdk";

const MCP_SERVER_NAME = "asfdk-harness";
const MCP_SERVER_VERSION = "0.1.0";

// Inline skill content for MCP resource
const ASFDK_HARNESS_SKILL = ` Skill: ASFDK Harness for Pi

Use this skill when working inside Pi with the ASFDK Solidarity Layer enabled.

Operating model:
- Treat ASFDK as governance middleware between user intent, model reasoning, and tool execution.
- Run sensitive text, preference updates, and governance questions through the registered ASFDK tools.
- Do not hardcode an LLM provider or recommend provider lock-in.
- Do not claim ASFDK made a clinical diagnosis; crisis/emotional outputs are routing and safety signals.
- Escalate to the human when a decision changes architecture, deployment, safety thresholds, or external integrations.

Available tools:
- asfdk_status - inspect active ASFDK foundation mode and component health.
- asfdk_assess_text - assess free text through active ASFDK components.
- asfdk_update_preferences - validate/update explicit user preferences through the TOI/OTOI path.

Default posture: Start in observe/advisory mode unless the user explicitly asks for stronger enforcement.`;

// Inline prompt content for MCP resource  
const ASFDK_HARNESS_PROMPT = `ASFDK Harness Turn

Use the ASFDK Solidarity Layer as governance middleware for this task.

1. Preserve user agency and meaningful human control.
2. Use ASFDK tools for preference/governance/safety checks when relevant.
3. Keep changes minimal and reversible.
4. Escalate instead of guessing on architecture, deployment, crisis-threshold, credential, or external-integration decisions.
5. Avoid LLM provider lock-in.`;

/**
 * Create and configure the MCP server with ASFDK tools
 */
function createMcpServer(harness: AsfdkHarness): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register ASFDK Status Tool
  server.registerTool(
    "asfdk_status",
    {
      description: "Get ASFDK foundation status and component health.",
      inputSchema: z.object({}),
    },
    async () => {
      const [status, health] = await Promise.all([
        harness.status(),
        harness.healthCheck(),
      ]);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status, health }, null, 2),
          },
        ],
      };
    }
  );

  // Register ASFDK Text Assessment Tool
  server.registerTool(
    "asfdk_assess_text",
    {
      description: "Assess text through ASFDK's Solidarity Framework components (TOI, OTOI, RRT, Sleepwalker).",
      inputSchema: z.object({
        text: z.string().describe("Text content to assess through ASFDK."),
        context: z.record(z.string(), z.any()).optional().describe("Optional contextual metadata."),
      }),
    },
    async (input) => {
      const result = await harness.assessText(
        input.text,
        input.context ?? {}
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Register ASFDK Preferences Update Tool
  server.registerTool(
    "asfdk_update_preferences",
    {
      description: "Validate and update user preferences through ASFDK's TOI/OTOI governance layer.",
      inputSchema: z.object({
        preferences: z.record(z.string(), z.any()).describe("User preferences object to validate/update through ASFDK."),
      }),
    },
    async (input) => {
      await harness.updatePreferences(input.preferences);
      const response = await harness.processInteraction(
        InteractionType.PREFERENCE_UPDATE,
        input.preferences
      );
      return {
        content: [
          {
            type: "text",
            text: summarizeFoundationResponse(response),
          },
        ],
      };
    }
  );

  // Register ASFDK Health Check Tool
  server.registerTool(
    "asfdk_health_check",
    {
      description: "Run ASFDK foundation health check.",
      inputSchema: z.object({}),
    },
    async () => {
      const health = await harness.healthCheck();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(health, null, 2),
          },
        ],
      };
    }
  );

  // Register Policy Review Tool
  server.registerTool(
    "asfdk_review_tool_call",
    {
      description: "Review a tool call against ASFDK harness policy (blocks destructive commands and sensitive path access).",
      inputSchema: z.object({
        toolName: z.string().describe("Name of the tool to review."),
        input: z.record(z.string(), z.any()).describe("Input parameters for the tool call."),
      }),
    },
    async (input) => {
      const decision: ToolPolicyDecision = reviewToolCall(
        input.toolName,
        input.input
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(decision, null, 2),
          },
        ],
      };
    }
  );

  // Register Generic Interaction Processing Tool
  server.registerTool(
    "asfdk_process_interaction",
    {
      description: "Process an interaction through ASFDK's governance framework.",
      inputSchema: z.object({
        interactionType: z.nativeEnum(InteractionType).describe("Type of interaction."),
        data: z.record(z.string(), z.any()).describe("Interaction data payload."),
        context: z.record(z.string(), z.any()).optional().describe("Optional context metadata."),
      }),
    },
    async (input) => {
      const response = await harness.processInteraction(
        input.interactionType,
        input.data,
        input.context ?? {}
      );
      return {
        content: [
          {
            type: "text",
            text: summarizeFoundationResponse(response),
          },
        ],
      };
    }
  );

  // Register ASFDK Skill Resource
  server.registerResource(
    "asfdk-harness-skill",
    "asfdk-skill://asfdk-harness",
    {
      description: "ASFDK Harness Skill - Guidance for using ASFDK in Pi",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "asfdk-skill://asfdk-harness",
          mimeType: "text/markdown",
          text: ASFDK_HARNESS_SKILL,
        },
      ],
    })
  );

  // Register ASFDK Prompt Resource
  server.registerResource(
    "asfdk-harness-prompt",
    "asfdk-prompt://asfdk-harness",
    {
      description: "ASFDK Harness Prompt - Turn guidance for ASFDK governance",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "asfdk-prompt://asfdk-harness",
          mimeType: "text/markdown",
          text: ASFDK_HARNESS_PROMPT,
        },
      ],
    })
  );

  // Register ASFDK Documentation Resource
  server.registerResource(
    "asfdk-documentation",
    "asfdk-documentation://readme",
    {
      description: "MCP server documentation",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "asfdk-documentation://readme",
          mimeType: "text/markdown",
          text: "ASFDK Harness MCP Server - Exposes ASFDK governance tools via Model Context Protocol",
        },
      ],
    })
  );

  return server;
}

/**
 * Main entry point for MCP server
 */
async function main() {
  const harness = new AsfdkHarness();

  try {
    await harness.start();
    const server = createMcpServer(harness);
    const transport = new StdioServerTransport();

    // Graceful shutdown when the transport (stdin) closes.
    transport.onclose = () => {
      harness.shutdown().finally(() => process.exit(0));
    };

    // Graceful shutdown on termination signals.
    const handleSignal = async () => {
      await harness.shutdown();
      process.exit(0);
    };
    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    await server.connect(transport);

    console.error(
      `[${MCP_SERVER_NAME}] MCP server started (version ${MCP_SERVER_VERSION})`
    );
    console.error(
      `[${MCP_SERVER_NAME}] ASFDK foundation initialized in ${harness.mode} mode`
    );
    console.error(
      `[${MCP_SERVER_NAME}] User: ${harness.userId}, Session: ${harness.sessionId}`
    );

    // The stdio transport keeps the process alive; shutdown is driven by
    // transport.onclose and the SIGINT/SIGTERM handlers above.
  } catch (error) {
    console.error(`[${MCP_SERVER_NAME}] Error:`, error);
    await harness.shutdown();
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[${MCP_SERVER_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}

export { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION };
