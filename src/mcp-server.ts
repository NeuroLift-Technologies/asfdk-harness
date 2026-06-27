#!/usr/bin/env node
/**
 * ASFDK Harness MCP Server
 *
 * Exposes ASFDK governance tools via Model Context Protocol (MCP).
 * Allows any MCP-compatible client to use ASFDK's Solidarity Framework capabilities.
 *
 * PATCH NOTES (applied 2026-06-26):
 *  - Fixed typo: asfdk_authority_chan → asfdk_authority_chain (tool name + skill string)
 *  - Added title + annotations to every registerTool call
 *  - Added try/catch with isError: true to every tool handler
 *  - Expanded all tool descriptions (return shape, use cases, when NOT to use)
 *  - Added structuredContent to all tool responses
 *  - Added .strict() to inputSchemas that carry fields
 *  - Added TODO comment for before_agent_start fail-open/fail-closed decision
 */

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AsfdkHarness, canExposeSensitiveGovernanceTools } from "./harness.js";
import { summarizeFoundationResponse } from "./harness.js";
import { reviewToolCall, type ToolPolicyDecision } from "./policy.js";
import { InteractionType } from "@neurolift-technologies/asfdk";
import {
  buildGovernanceAuthorityInfo,
  buildGovernanceRawData,
  formatGovernanceSummary,
} from "./tools.js";

const MCP_SERVER_NAME = "asfdk-harness";
const MCP_SERVER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Skill content strings
// NOTE: asfdk_authority_chain typo fixed in the line below (was: asfdk_authority_chan)
// ---------------------------------------------------------------------------

const ASFDK_HARNESS_SKILL_BASE = `Skill: ASFDK Harness for Pi

Use this skill when working inside Pi with the ASFDK Solidarity Layer enabled.

Operating model:
- Treat ASFDK as governance middleware between user intent, model reasoning, and tool execution.
- Run sensitive text, preference updates, and governance questions through the registered ASFDK tools.
- Do not hardcode an LLM provider or recommend provider lock-in.
- Do not claim ASFDK made a clinical diagnosis; crisis/emotional outputs are routing and safety signals.
- Escalate to the human when a decision changes architecture, deployment, safety thresholds, or external integrations.

Available tools:
- asfdk_status             - Inspect active ASFDK foundation mode and component health.
- asfdk_assess_text        - Assess free text through active ASFDK components.
- asfdk_update_preferences - Validate/update explicit user preferences through the TOI/OTOI path.
- asfdk_health_check       - Run a full ASFDK foundation health check.
- asfdk_review_tool_call   - Review a proposed tool call against harness policy before executing it.
- asfdk_process_interaction - Process any typed interaction through the governance framework.`;

const ASFDK_HARNESS_GOVERNANCE_SKILL = `
- asfdk_governance_summary - Get human-readable governance state and authority structure (prefer governance file over file search).
- asfdk_authority_chain    - Inspect authority chain, decision makers, and escalation paths (prefer governance file over file search).
- asfdk_governance_raw     - Get raw governance protocol data for debugging (prefer governance file over file search).`;

const ASFDK_HARNESS_SKILL_FOOTER = `
Default posture: Start in observe/advisory mode unless the user explicitly asks for stronger enforcement.`;

const ASFDK_HARNESS_GOVERNANCE_ALIASES = `
MCP Resource Aliases:
- asfdk-governance://summary         - Access governance summary via MCP
- asfdk-governance://authority-chain - Access authority chain via MCP
- asfdk-governance://status          - Access raw governance status via MCP`;

function formatAsfdkHarnessSkill(includeSensitiveGovernanceTools: boolean): string {
  return [
    ASFDK_HARNESS_SKILL_BASE,
    includeSensitiveGovernanceTools ? ASFDK_HARNESS_GOVERNANCE_SKILL : undefined,
    ASFDK_HARNESS_SKILL_FOOTER,
    includeSensitiveGovernanceTools ? ASFDK_HARNESS_GOVERNANCE_ALIASES : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Prompt content
// ---------------------------------------------------------------------------

const ASFDK_HARNESS_PROMPT = `ASFDK Harness Turn

Use the ASFDK Solidarity Layer as governance middleware for this task.

1. Preserve user agency and meaningful human control.
2. Use ASFDK tools for preference/governance/safety checks when relevant.
3. Keep changes minimal and reversible.
4. Escalate instead of guessing on architecture, deployment, crisis-threshold, credential, or external-integration decisions.
5. Avoid LLM provider lock-in.`;

// ---------------------------------------------------------------------------
// Shared error helper
// ---------------------------------------------------------------------------

function toolError(error: unknown, hint?: string): { isError: true; content: [{ type: "text"; text: string }] } {
  const message = error instanceof Error ? error.message : String(error);
  const full = hint ? `${message}. ${hint}` : message;
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${full}` }],
  };
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Create and configure the MCP server with ASFDK tools.
 */
function createMcpServer(harness: AsfdkHarness): McpServer {
  const exposeSensitiveGovernanceTools = canExposeSensitiveGovernanceTools(harness.mode);

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

  // -------------------------------------------------------------------------
  // Tool: asfdk_status
  // -------------------------------------------------------------------------
  server.registerTool(
    "asfdk_status",
    {
      title: "ASFDK Status",
      description: `Get the current ASFDK foundation mode and per-component health snapshot.

Use this tool first when diagnosing unexpected governance behaviour, before calling
asfdk_health_check or any governance-specific tool.

Returns a JSON object with two top-level keys:
  status  - { mode, sessionId, userId, activeComponents: string[] }
  health  - { ok: boolean, components: Record<string, { ok: boolean, detail?: string }> }

Do NOT use this tool to modify preferences or trigger governance actions.
Do NOT call this repeatedly in a tight loop; once per diagnosis pass is sufficient.

Examples:
  - "Is the RRT component active?" → call asfdk_status, inspect health.components.rrt
  - "What mode is the harness running in?" → call asfdk_status, read status.mode`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const [status, health] = await Promise.all([
          harness.status(),
          harness.healthCheck(),
        ]);
        const output = { status, health };
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error, "Try asfdk_health_check to get a partial status if the harness is degraded.");
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: asfdk_assess_text
  // -------------------------------------------------------------------------
  server.registerTool(
    "asfdk_assess_text",
    {
      title: "Assess Text",
      description: `Run free-form text through the active ASFDK Solidarity Framework components
(TOI, OTOI, RRT AIdvocAIte, Sleepwalker Protocol) and return a structured assessment.

Use this tool when:
  - You need to determine whether user-supplied text triggers any governance or safety signals.
  - You want to check whether a draft response complies with the active TOI.
  - Text may contain crisis, distress, or preference-update signals that ASFDK should handle.

Parameters:
  text    (required) - The content to assess. Pass the raw string; do not pre-filter.
  context (optional) - Arbitrary key-value metadata that helps ASFDK components contextualise
                       the text (e.g. { "source": "user_message", "threadId": "abc123" }).

Returns a JSON object whose schema depends on the active components, but always includes:
  { signals: string[], flags: string[], componentResults: Record<string, unknown>, safe: boolean }

Do NOT use this tool to update preferences (use asfdk_update_preferences instead).
Do NOT pass binary or base64 content; text content only.

Examples:
  - Checking a user message for RRT signals: assess_text({ text: userMessage, context: { source: "chat" } })
  - Validating a draft AI reply: assess_text({ text: draftReply, context: { source: "ai_response" } })`,
      inputSchema: z.object({
        text: z.string().describe("Text content to assess through ASFDK."),
        context: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional contextual metadata (e.g. { source, threadId })."),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await harness.assessText(input.text, input.context ?? {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return toolError(error, "Ensure the harness is healthy (call asfdk_status) and that text is a non-empty string.");
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: asfdk_update_preferences
  // -------------------------------------------------------------------------
  server.registerTool(
    "asfdk_update_preferences",
    {
      title: "Update User Preferences",
      description: `Validate and persist an explicit user preference update through the ASFDK
TOI/OTOI governance layer. Preferences are routed through governance before being saved,
ensuring they comply with the active Terms of Interaction.

Use this tool ONLY when the user has explicitly expressed a preference change, not to
infer preferences from behaviour. Always present the validated result to the user before
applying it to the session.

Parameters:
  preferences (required) - Key-value map of the preferences to update.
                           Example: { "tone": "direct", "scaffolding": "minimal" }

Returns a human-readable summary string from the governance foundation describing what
was accepted, modified, or rejected by the TOI/OTOI validation pass.

IMPORTANT: This tool modifies persistent user state. Escalate to the human if the
preferences object touches safety thresholds, agent permissions, or data-retention settings.

Do NOT call this tool to probe what preferences are currently set; use asfdk_status instead.
Do NOT call this tool more than once per explicit user preference statement.`,
      inputSchema: z.object({
        preferences: z
          .record(z.string(), z.unknown())
          .describe("User preferences object to validate/update through ASFDK."),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        await harness.updatePreferences(input.preferences);
        const response = await harness.processInteraction(
          InteractionType.PREFERENCE_UPDATE,
          input.preferences
        );
        const summary = summarizeFoundationResponse(response);
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { summary, preferences: input.preferences },
        };
      } catch (error) {
        return toolError(error, "Verify the preferences object contains only string keys. Escalate to the human if a safety-threshold preference was attempted.");
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: asfdk_health_check
  // -------------------------------------------------------------------------
  server.registerTool(
    "asfdk_health_check",
    {
      title: "ASFDK Health Check",
      description: `Run a full health check across all ASFDK foundation components and return
a per-component status report.

Use this tool when:
  - A previous tool call returned an unexpected error and you need to diagnose the harness.
  - You want to confirm all Solidarity Framework components (TOI, OTOI, RRT, Sleepwalker)
    are operational before starting a sensitive governance workflow.

Returns a JSON object:
  { ok: boolean, components: Record<string, { ok: boolean, detail?: string }> }

Prefer asfdk_status for a combined mode + health overview.
Use this tool when you specifically need granular component-level health without
the mode/session data that asfdk_status includes.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const health = await harness.healthCheck();
        return {
          content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
          structuredContent: health as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return toolError(error, "If the health check itself fails, the harness may need to be restarted.");
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: asfdk_review_tool_call
  // -------------------------------------------------------------------------
  server.registerTool(
    "asfdk_review_tool_call",
    {
      title: "Review Tool Call",
      description: `Check a proposed tool call against the ASFDK harness policy before executing it.
The policy layer blocks destructive shell commands and access to sensitive file paths.

Use this tool when:
  - You are about to invoke a tool that modifies files, runs shell commands, or accesses
    sensitive paths, and you want a governance decision before proceeding.
  - An agent is operating in a pipeline and needs to validate actions against policy.

Parameters:
  toolName (required) - The exact name of the tool being reviewed (e.g. "bash", "write_file").
  input    (required) - The full input object the tool would receive.

Returns a JSON ToolPolicyDecision:
  {
    allowed:  boolean,
    reason:   string,       // Human-readable explanation of the decision
    severity: "block" | "warn" | "allow",
    matchedRule?: string    // Which policy rule triggered (if any)
  }

Do NOT skip this check for shell execution tools in production agent pipelines.
Do NOT use this tool to review ASFDK's own tools (those are governed internally).

Examples:
  - Before running rm -rf: review_tool_call({ toolName: "bash", input: { command: "rm -rf /tmp/x" } })
  - Before writing to /etc: review_tool_call({ toolName: "write_file", input: { path: "/etc/hosts" } })`,
      inputSchema: z.object({
        toolName: z.string().describe("Name of the tool to review."),
        input: z
          .record(z.string(), z.unknown())
          .describe("Input parameters for the tool call."),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const decision: ToolPolicyDecision = reviewToolCall(input.toolName, input.input);
        return {
          content: [{ type: "text", text: JSON.stringify(decision, null, 2) }],
          structuredContent: decision as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return toolError(error, "Ensure toolName is a non-empty string and input is a valid object.");
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: asfdk_process_interaction
  // -------------------------------------------------------------------------
  server.registerTool(
    "asfdk_process_interaction",
    {
      title: "Process Interaction",
      description: `Route a typed interaction through the full ASFDK governance framework and
return a summarised foundation response.

This is the generic entry point for interactions that do not map to a more specific tool
(asfdk_assess_text, asfdk_update_preferences, etc.). Use the specific tools first; fall back
to this tool for custom or composite interaction types.

Parameters:
  interactionType (required) - One of the InteractionType enum values defined in
                               @neurolift-technologies/asfdk (e.g. "USER_MESSAGE",
                               "AGENT_ACTION", "PREFERENCE_UPDATE", "CRISIS_SIGNAL").
  data            (required) - Interaction payload. Schema depends on interactionType.
  context         (optional) - Arbitrary key-value metadata to attach to the interaction.

Returns a human-readable summary string from the governance foundation.

ESCALATE to the human if the interaction type involves CRISIS_SIGNAL, AGENT_ACTION with
external integrations, or any type that changes safety thresholds.

Do NOT use this tool as a shortcut to bypass asfdk_update_preferences for preference changes.
Do NOT pass partial or malformed data objects; the governance layer may produce unpredictable
routing decisions on incomplete inputs.`,
      inputSchema: z.object({
        interactionType: z
          .nativeEnum(InteractionType)
          .describe("Type of interaction (e.g. USER_MESSAGE, PREFERENCE_UPDATE)."),
        data: z
          .record(z.string(), z.unknown())
          .describe("Interaction data payload. Schema depends on interactionType."),
        context: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional context metadata."),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const response = await harness.processInteraction(
          input.interactionType,
          input.data,
          input.context ?? {}
        );
        const summary = summarizeFoundationResponse(response);
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { summary, interactionType: input.interactionType },
        };
      } catch (error) {
        return toolError(error, `Verify that the interactionType '${String(input?.interactionType)}' is a valid InteractionType enum value and that the data payload matches its expected schema.`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Resources: skill, prompt, documentation
  // -------------------------------------------------------------------------
  server.registerResource(
    "asfdk-harness-skill",
    "asfdk-skill://asfdk-harness",
    {
      description: "ASFDK Harness Skill — Guidance for using ASFDK governance tools in Pi",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "asfdk-skill://asfdk-harness",
          mimeType: "text/markdown",
          text: formatAsfdkHarnessSkill(exposeSensitiveGovernanceTools),
        },
      ],
    })
  );

  server.registerResource(
    "asfdk-harness-prompt",
    "asfdk-prompt://asfdk-harness",
    {
      description: "ASFDK Harness Prompt — Per-turn governance guidance",
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
          text: "ASFDK Harness MCP Server — Exposes ASFDK Solidarity Framework governance tools via Model Context Protocol",
        },
      ],
    })
  );

  // -------------------------------------------------------------------------
  // Governance tools (conditional on harness mode)
  // -------------------------------------------------------------------------
  if (exposeSensitiveGovernanceTools) {

    // Tool: asfdk_governance_summary
    server.registerTool(
      "asfdk_governance_summary",
      {
        title: "Governance Summary",
        description: `Return a human-readable summary of the current ASFDK governance state,
including active authority structure, component assignments, and policy posture.

Prefer this tool over searching governance files directly. This tool reads from the
live protocol context, not from disk, so it reflects the runtime state.

Use this tool when:
  - You need a quick orientation on who holds authority and what policies are active.
  - You are preparing to escalate a decision and need to know the escalation path.
  - An external caller asks "what governance is in place?"

Returns a formatted markdown string. For machine-readable data use asfdk_governance_raw.
For the detailed authority chain use asfdk_authority_chain.

Do NOT use this tool repeatedly in a single turn; one call per governance orientation is sufficient.`,
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        try {
          const protocolContext = await harness.protocolContext();
          const summary = formatGovernanceSummary(protocolContext);
          return {
            content: [{ type: "text", text: summary }],
            structuredContent: { summary },
          };
        } catch (error) {
          return toolError(error, "Ensure the harness is running in a mode that exposes governance tools and that the protocol context is initialised.");
        }
      }
    );

    // Tool: asfdk_authority_chain
    // NOTE: Previously named asfdk_authority_chan — typo fixed here and in skill string above.
    server.registerTool(
      "asfdk_authority_chain",
      {
        title: "Authority Chain",
        description: `Inspect the current ASFDK authority chain: who the decision-makers are,
what their roles are, and what the escalation path looks like for different decision types.

Prefer this tool over searching governance files directly. This tool reflects the live
runtime authority structure, not a static file snapshot.

Use this tool when:
  - You need to know exactly who to escalate a specific decision to.
  - You want to verify that the authority chain is correctly configured before a sensitive action.
  - Debugging a governance routing mismatch (e.g. a decision reached the wrong authority level).

Returns a JSON object:
  {
    authorities: Array<{ role: string, holder: string, scope: string[] }>,
    escalationPaths: Record<string, string>,   // decisionType → authority role
    currentDecisionMaker: string
  }

Do NOT confuse this with asfdk_governance_summary (human-readable overview) or
asfdk_governance_raw (full protocol dump). This tool is scoped to authority and escalation.`,
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        try {
          const protocolContext = await harness.protocolContext();
          const authorityInfo = buildGovernanceAuthorityInfo(protocolContext);
          return {
            content: [{ type: "text", text: JSON.stringify(authorityInfo, null, 2) }],
            structuredContent: authorityInfo as Record<string, unknown>,
          };
        } catch (error) {
          return toolError(error, "Verify that the protocol context is initialised and that the harness mode allows authority chain inspection.");
        }
      }
    );

    // Tool: asfdk_governance_raw
    server.registerTool(
      "asfdk_governance_raw",
      {
        title: "Governance Raw Data",
        description: `Return the raw governance protocol data including the full TOI, OTOI,
and policy documents as a single JSON dump. Intended for debugging and deep inspection only.

Prefer asfdk_governance_summary for human-readable orientation.
Prefer asfdk_authority_chain for escalation and authority questions.
Use this tool only when you need the complete raw protocol context.

Returns a JSON object containing the full protocol context. The exact schema depends on
the active ASFDK version but will always include:
  { toi: object, otoi: object, policies: object[], version: string }

WARNING: The response may be large. If you only need a subset of the governance data,
call asfdk_governance_summary or asfdk_authority_chain instead.

Do NOT expose this raw output directly to end users without redacting sensitive fields.`,
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        try {
          const protocolContext = await harness.protocolContext();
          const rawData = buildGovernanceRawData(protocolContext);
          return {
            content: [{ type: "text", text: JSON.stringify(rawData, null, 2) }],
            structuredContent: rawData as Record<string, unknown>,
          };
        } catch (error) {
          return toolError(error, "If the protocol context cannot be loaded, try asfdk_health_check to identify which component is degraded.");
        }
      }
    );

    // Governance resource aliases
    server.registerResource(
      "asfdk-governance-summary",
      "asfdk-governance://summary",
      {
        description: "ASFDK Governance Summary — Human-readable governance state and authority structure",
        mimeType: "text/markdown",
      },
      async () => {
        const protocolContext = await harness.protocolContext();
        return {
          contents: [
            {
              uri: "asfdk-governance://summary",
              mimeType: "text/markdown",
              text: formatGovernanceSummary(protocolContext),
            },
          ],
        };
      }
    );

    server.registerResource(
      "asfdk-governance-authority",
      "asfdk-governance://authority-chain",
      {
        description: "ASFDK Authority Chain — Authority structure, decision makers, and escalation paths",
        mimeType: "application/json",
      },
      async () => {
        const protocolContext = await harness.protocolContext();
        return {
          contents: [
            {
              uri: "asfdk-governance://authority-chain",
              mimeType: "application/json",
              text: JSON.stringify(buildGovernanceAuthorityInfo(protocolContext), null, 2),
            },
          ],
        };
      }
    );

    server.registerResource(
      "asfdk-governance-status",
      "asfdk-governance://status",
      {
        description: "ASFDK Governance Status — Raw governance protocol data for debugging",
        mimeType: "application/json",
      },
      async () => {
        const protocolContext = await harness.protocolContext();
        return {
          contents: [
            {
              uri: "asfdk-governance://status",
              mimeType: "application/json",
              text: JSON.stringify(buildGovernanceRawData(protocolContext), null, 2),
            },
          ],
        };
      }
    );
  }

  return server;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * TODO (unresolved): before_agent_start fail-open vs fail-closed decision.
 *
 * Currently harness.start() throws on init failure and the process exits (fail-closed).
 * If you want fail-open behaviour (harness starts in degraded/observe-only mode on error),
 * wrap harness.start() in a try/catch, log the error to stderr, and allow main() to
 * continue with the server in a limited state. Update canExposeSensitiveGovernanceTools
 * accordingly so governance tools are suppressed when the harness is degraded.
 *
 * Decision criteria:
 *  - Fail-closed: safer for production; no governance → no operation.
 *  - Fail-open:   safer for availability; degraded governance is better than none
 *                 in low-risk/advisory-only pipelines.
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

    // Use stderr for all logging — stdout is reserved for the MCP stdio transport.
    console.error(`[${MCP_SERVER_NAME}] MCP server started (version ${MCP_SERVER_VERSION})`);
    console.error(`[${MCP_SERVER_NAME}] ASFDK foundation initialised in ${harness.mode} mode`);
    console.error(`[${MCP_SERVER_NAME}] User: ${harness.userId}, Session: ${harness.sessionId}`);
    console.error(`[${MCP_SERVER_NAME}] Sensitive governance tools: ${canExposeSensitiveGovernanceTools(harness.mode) ? "ENABLED" : "DISABLED"}`);
  } catch (error) {
    console.error(`[${MCP_SERVER_NAME}] Startup error:`, error);
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
