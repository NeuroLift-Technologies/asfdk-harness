#!/usr/bin/env node
/**
 * ASFDK Harness MCP Server
 * 
 * Exposes ASFDK governance tools via Model Context Protocol (MCP)
 * Allows any MCP-compatible client to use ASFDK's Solidarity Framework capabilities
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AsfdkHarness } from "./harness.js";
import { summarizeFoundationResponse } from "./harness.js";
import { reviewToolCall, type ToolPolicyDecision } from "./policy.js";
import { InteractionType } from "@neurolift-technologies/asfdk";

const MCP_SERVER_NAME = "asfdk-harness";
const MCP_SERVER_VERSION = "0.1.0";

/**
 * Input schema for asfdk_assess_text tool
 */
const AssessTextInputSchema = z.object({
  text: z.string().describe("Text content to assess through ASFDK."),
  context: z.record(z.unknown()).optional().describe("Optional contextual metadata."),
});

/**
 * Input schema for asfdk_update_preferences tool
 */
const PreferencesInputSchema = z.object({
  preferences: z.record(z.unknown()).describe("User preferences object to validate/update through ASFDK."),
});

/**
 * Input schema for asfdk_review_tool_call tool
 */
const ReviewToolCallInputSchema = z.object({
  toolName: z.string().describe("Name of the tool to review."),
  input: z.record(z.unknown()).describe("Input parameters for the tool call."),
});

/**
 * Input schema for asfdk_process_interaction tool
 */
const ProcessInteractionInputSchema = z.object({
  interactionType: z.string().describe("Type of interaction (e.g., EMOTIONAL_ASSESSMENT, PREFERENCE_UPDATE)."),
  data: z.record(z.unknown()).describe("Interaction data payload."),
  context: z.record(z.unknown()).optional().describe("Optional context metadata."),
});

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
        prompts: {},
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
      outputSchema: z.record(z.unknown()),
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
        details: { status, health },
      };
    }
  );

  // Register ASFDK Text Assessment Tool
  server.registerTool(
    "asfdk_assess_text",
    {
      description: "Assess text through ASFDK's Solidarity Framework components (TOI, OTOI, RRT, Sleepwalker).",
      inputSchema: AssessTextInputSchema,
      outputSchema: z.record(z.unknown()),
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
        details: result as unknown as Record<string, unknown>,
      };
    }
  );

  // Register ASFDK Preferences Update Tool
  server.registerTool(
    "asfdk_update_preferences",
    {
      description: "Validate and update user preferences through ASFDK's TOI/OTOI governance layer.",
      inputSchema: PreferencesInputSchema,
      outputSchema: z.record(z.unknown()),
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
        details: response as unknown as Record<string, unknown>,
      };
    }
  );

  // Register ASFDK Health Check Tool
  server.registerTool(
    "asfdk_health_check",
    {
      description: "Run ASFDK foundation health check.",
      inputSchema: z.object({}),
      outputSchema: z.record(z.unknown()),
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
        details: health as unknown as Record<string, unknown>,
      };
    }
  );

  // Register Policy Review Tool
  server.registerTool(
    "asfdk_review_tool_call",
    {
      description: "Review a tool call against ASFDK harness policy (blocks destructive commands and sensitive path access).",
      inputSchema: ReviewToolCallInputSchema,
      outputSchema: z.record(z.unknown()),
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
        details: decision,
      };
    }
  );

  // Register Generic Interaction Processing Tool
  server.registerTool(
    "asfdk_process_interaction",
    {
      description: "Process an interaction through ASFDK's governance framework.",
      inputSchema: ProcessInteractionInputSchema,
      outputSchema: z.record(z.unknown()),
    },
    async (input) => {
      const response = await harness.processInteraction(
        input.interactionType as InteractionType,
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
        details: response as unknown as Record<string, unknown>,
      };
    }
  );

  // Register ASFDK Documentation Resource
  server.registerResource(
    "asfdk-documentation",
    "asfdk-documentation://readme",
    {
      description: "Read-only documentation about ASFDK Harness capabilities",
      mimeType: "text/markdown",
    },
    async () => {
      return {
        contents: [
          {
            uri: "asfdk-documentation://readme",
            mimeType: "text/markdown",
            text: `# ASFDK Harness MCP Server

## Overview

This MCP server exposes NeuroLift Technologies' ASFDK (Agent Solidarity Framework Development Kit) capabilities via the Model Context Protocol.

## Capabilities

- **Governance Assessment**: Evaluate text through TOI, OTOI, RRT Advocate, and Sleepwalker Protocol
- **Preference Management**: Validate and update user preferences with governance checks
- **Health Monitoring**: Check ASFDK foundation component health
- **Policy Enforcement**: Review tool calls against safety policies

## Tools

### asfdk_status
Get ASFDK foundation status and component health.

### asfdk_assess_text
Assess text through ASFDK's Solidarity Framework components.

**Input:**
- text (required): Text content to assess
- context (optional): Contextual metadata

**Output:** Foundation assessment response with emotional state and interaction analysis

### asfdk_update_preferences
Validate and update user preferences through ASFDK governance layer.

**Input:**
- preferences (required): User preferences object to validate/update

**Output:** TOI/OTOI validation response

### asfdk_health_check
Run ASFDK foundation health check.

**Output:** Health check results for all ASFDK components

### asfdk_review_tool_call
Review a tool call against ASFDK harness policy.

**Input:**
- toolName (required): Name of the tool to review
- input (required): Input parameters for the tool call

**Output:** Policy decision (allow/block with reasoning)

### asfdk_process_interaction
Process an interaction through ASFDK's governance framework.

**Input:**
- interactionType (required): Type of interaction
- data (required): Interaction data payload
- context (optional): Context metadata

**Output:** Foundation interaction response

## Environment Variables

- **ASFDK_USER_ID**: User identifier for ASFDK foundation (default: pi-user)
- **ASFDK_MODE**: Foundation mode (unified, crisis_only, continuity, framework, development)
- **PI_SESSION_ID**: Pi session identifier

## Solidarity Framework

This MCP server operates under:
- **Solidarity Framework**: Cooperative, transparent, human-centered AI collaboration
- **HAIEF**: Human-AI Ethical Integration Framework
- **Non-exploitation principle**: No agent behavior that extracts value without human benefit

## Usage

Connect to this MCP server via any MCP-compatible client (Pi, Claude Code, VS Code MCP extension, etc.)`,
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Main entry point for MCP server
 */
async function main() {
  const harness = new AsfdkHarness();

  try {
    // Initialize ASFDK foundation
    await harness.start();

    // Create MCP server
    const server = createMcpServer(harness);

    // Set up stdio transport for MCP communication
    const transport = new StdioServerTransport();

    // Connect server to transport
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

    // Keep server running
    // The server will process messages as they come in via stdio
    // This promise should never resolve unless there's an error
    await new Promise(() => {});
  } catch (error) {
    console.error(`[${MCP_SERVER_NAME}] Error:`, error);
    process.exit(1);
  } finally {
    await harness.shutdown();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[${MCP_SERVER_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}

export { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION };
