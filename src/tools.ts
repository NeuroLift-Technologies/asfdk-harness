import { InteractionType } from "@neurolift-technologies/asfdk";
import { Type, type Static } from "typebox";
import type { AsfdkHarness } from "./harness.js";
import { summarizeFoundationResponse } from "./harness.js";
import { getThirdPartyProtocolProfiles } from "./protocols.js";

export const AssessTextParams = Type.Object({
  text: Type.String({ description: "Free-text content to assess through ASFDK." }),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Optional contextual metadata." })),
});

export const PreferencesParams = Type.Object({
  preferences: Type.Record(Type.String(), Type.Unknown(), {
    description: "Candidate TOI/user preference object to validate/update through ASFDK.",
  }),
});

export type AssessTextInput = Static<typeof AssessTextParams>;
export type PreferencesInput = Static<typeof PreferencesParams>;

export interface AsfdkToolSkill {
  /** Pi tool this skill maps to; kept 1:1 with the tools returned by createAsfdkTools(). */
  toolName: string;
  id: string;
  name: string;
  description: string;
  tags: string[];
}

/**
 * Canonical catalog mapping every Pi tool exposed by createAsfdkTools() to its A2A
 * AgentSkill metadata. This is the single source of truth the A2A Agent Card derives
 * its advertised skills from, so the card can never drift from the real tool set
 * (no phantom skills, and every real tool is advertised).
 */
export const ASFDK_TOOL_SKILLS: AsfdkToolSkill[] = [
  {
    toolName: "asfdk_status",
    id: "asfdk.status",
    name: "ASFDK status",
    description: "Inspect foundation health, governance state, and loaded protocol context.",
    tags: ["asfdk", "status", "health", "governance"],
  },
  {
    toolName: "asfdk_protocol_status",
    id: "asfdk.protocol_status",
    name: "ASFDK protocol status",
    description: "Inspect local TOI/OTOI resolution and non-MCP protocol loading.",
    tags: ["asfdk", "protocols", "toi", "otoi"],
  },
  {
    toolName: "asfdk_interop_protocols",
    id: "asfdk.interop_protocols",
    name: "ASFDK interop protocols",
    description: "Inspect third-party interoperability protocol targets and MCP exclusion status.",
    tags: ["asfdk", "interop", "a2a", "protocols"],
  },
  {
    toolName: "asfdk_a2a_agent_card",
    id: "asfdk.a2a_agent_card",
    name: "ASFDK A2A agent card",
    description: "Generate a TOI/OTOI-governed A2A Agent Card for the current harness state.",
    tags: ["asfdk", "a2a", "agent-card", "discovery"],
  },
  {
    toolName: "asfdk_assess_text",
    id: "asfdk.assess_text",
    name: "ASFDK assess text",
    description: "Run governed text assessment through the active ASFDK foundation.",
    tags: ["asfdk", "assessment", "governance", "safety"],
  },
  {
    toolName: "asfdk_update_preferences",
    id: "asfdk.update_preferences",
    name: "ASFDK update preferences",
    description: "Validate and update user preferences through TOI/OTOI enforcement.",
    tags: ["asfdk", "preferences", "toi", "otoi"],
  },
];

export function createAsfdkTools(harness: AsfdkHarness) {
  return [
    {
      name: "asfdk_status",
      label: "ASFDK Status",
      description: "Return ASFDK foundation status, component health, and non-MCP protocol status for the active Pi session.",
      promptSnippet: "Inspect ASFDK foundation mode, component activation, and health.",
      promptGuidelines: ["Use asfdk_status when the user asks about the active ASFDK/Solidarity layer."],
      parameters: Type.Object({}),
      async execute() {
        const [status, health] = await Promise.all([harness.status(), harness.healthCheck()]);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status, health }, null, 2) }],
          details: { status, health },
        };
      },
    },
    {
      name: "asfdk_protocol_status",
      label: "ASFDK Protocol Status",
      description: "Return non-MCP TOI/OTOI integration protocol status for the active harness.",
      promptSnippet: "Inspect local .toi/.otoi protocol loading, OTOI resolution, and non-MCP integration surfaces.",
      promptGuidelines: [
        "Use asfdk_protocol_status when the user asks how the harness integrates TOI/OTOI without MCP.",
      ],
      parameters: Type.Object({}),
      async execute() {
        const protocols = await harness.protocolSnapshot();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(protocols, null, 2) }],
          details: protocols as unknown as Record<string, unknown>,
        };
      },
    },
    {
      name: "asfdk_interop_protocols",
      label: "ASFDK Interop Protocols",
      description: "Return third-party interoperability protocol targets and MCP exclusion status.",
      promptSnippet: "Inspect A2A, ACP, AG-UI, REST/OpenAPI, and other non-MCP third-party protocol targets.",
      promptGuidelines: [
        "Use asfdk_interop_protocols when the user asks about A2A or third-party protocol integration.",
      ],
      parameters: Type.Object({}),
      async execute() {
        const protocols = getThirdPartyProtocolProfiles();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(protocols, null, 2) }],
          details: { protocols },
        };
      },
    },
    {
      name: "asfdk_a2a_agent_card",
      label: "ASFDK A2A Agent Card",
      description: "Generate a TOI/OTOI-governed A2A Agent Card for the current harness state.",
      promptSnippet: "Inspect the generated A2A Agent Card for the current ASFDK harness.",
      promptGuidelines: [
        "Use asfdk_a2a_agent_card when the user asks how this harness would present itself to A2A peers.",
      ],
      parameters: Type.Object({}),
      async execute() {
        const card = await harness.a2aAgentCard();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          details: card as unknown as Record<string, unknown>,
        };
      },
    },
    {
      name: "asfdk_assess_text",
      label: "ASFDK Assess Text",
      description: "Assess text through ASFDK's active Solidarity Framework components.",
      promptSnippet: "Run free-text content through ASFDK emotional/crisis/governance assessment.",
      promptGuidelines: [
        "Use asfdk_assess_text for governance preflight, emotional state assessment, or crisis-signal review.",
      ],
      parameters: AssessTextParams,
      async execute(_toolCallId: string, params: AssessTextInput) {
        const result = await harness.assessText(params.text, params.context ?? {});
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: result as unknown as Record<string, unknown>,
        };
      },
    },
    {
      name: "asfdk_update_preferences",
      label: "ASFDK Update Preferences",
      description: "Validate/update a user preference object through the TOI/OTOI-enabled ASFDK foundation.",
      promptSnippet: "Validate or update user preferences through ASFDK TOI/OTOI enforcement.",
      promptGuidelines: ["Use asfdk_update_preferences only when the user explicitly asks to validate or update preferences."],
      parameters: PreferencesParams,
      async execute(_toolCallId: string, params: PreferencesInput) {
        await harness.updatePreferences(params.preferences);
        const response = await harness.processInteraction(InteractionType.PREFERENCE_UPDATE, params.preferences);
        return {
          content: [{ type: "text" as const, text: summarizeFoundationResponse(response) }],
          details: response as unknown as Record<string, unknown>,
        };
      },
    },
  ];
}
