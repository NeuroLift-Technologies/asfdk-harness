import { createProtocolSnapshot, type GovernanceProtocolContext, type ThirdPartyProtocolProfile } from "./protocols.js";
import { ASFDK_TOOL_SKILLS, isSensitiveGovernanceToolName } from "./tools.js";
import type { CardSurface } from "./a2a-identity.js";

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/**
 * A2A capability extension (vendor namespace). Used to advertise NeuroLift TOI/OTOI
 * governance features without polluting the standard top-level AgentCard fields.
 */
export interface A2AAgentExtension {
  uri: string;
  description?: string;
  required: boolean;
  params?: Record<string, unknown>;
}

export interface A2AAgentCardOptions {
  agentId?: string;
  agentName?: string;
  description?: string;
  url?: string;
  version?: string;
  protocolVersion?: string;
  preferredTransport?: "JSONRPC";
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  streaming?: boolean;
  pushNotifications?: boolean;
  includeSensitiveGovernanceTools?: boolean;
}

export interface A2AAgentCard {
  kind: "a2a-agent-card";
  protocolVersion: string;
  id: string;
  name: string;
  description: string;
  version: string;
  url: string;
  preferredTransport: "JSONRPC";
  defaultInputModes: string[];
  defaultOutputModes: string[];
  discovery: {
    protocol: "A2A";
    mechanism: "Agent Card";
  };
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
    extensions: A2AAgentExtension[];
  };
  governance: {
    toiPath: string;
    otoiPath: string;
    toiAuthor?: string;
    privacy?: Record<string, unknown>;
    agency?: Record<string, unknown>;
    guardrails: string[];
    authority: {
      finalDecisionMaker?: string;
      escalationRule?: string;
    };
    otoi: {
      version?: string;
      agents: string[];
      tiers: string[];
      enforcement?: Record<string, unknown>;
      conflicts: number;
    } | undefined;
  };
  skills: A2ASkill[];
  interopProtocols: Array<Pick<ThirdPartyProtocolProfile, "id" | "name" | "layer" | "status" | "discovery" | "harnessSurface">>;
  metadata: {
    generatedAt: string;
    cwd: string;
    protocolSurface: string[];
    diagnostics: string[];
  };
}

const A2A_PROTOCOL_VERSION = "0.3.0";
const NLT_GOVERNANCE_EXTENSION_URI = "https://neurolift.tech/a2a/extensions/governance";
const DEFAULT_A2A_MODES = ["text/plain", "application/json"];

export function createA2AAgentCard(
  context: GovernanceProtocolContext,
  options: A2AAgentCardOptions = {},
): A2AAgentCard {
  const snapshot = createProtocolSnapshot(context);
  const interopProtocols = snapshot.thirdPartyProtocols.filter((protocol) => protocol.status !== "separate-owner");
  const skills = buildA2ASkills(options.includeSensitiveGovernanceTools ?? false);
  const authority = asRecord(context.devOtoi?.authority);

  const diagnostics = [...context.diagnostics];
  const url = options.url ?? (typeof process !== "undefined" ? process.env.ASFDK_A2A_URL : undefined) ?? "";
  if (!url) {
    diagnostics.push(
      "A2A Agent Card has no service endpoint URL; set ASFDK_A2A_URL or pass options.url. The card is emitted without a callable endpoint.",
    );
  }

  return {
    kind: "a2a-agent-card",
    protocolVersion: options.protocolVersion ?? A2A_PROTOCOL_VERSION,
    id: options.agentId ?? "asfdk-harness",
    name: options.agentName ?? "ASFDK Harness",
    description:
      options.description ??
      "Governed Pi harness for TOI/OTOI-aware agent delegation and third-party interoperability.",
    version: options.version ?? "0.1.0",
    url,
    preferredTransport: options.preferredTransport ?? "JSONRPC",
    defaultInputModes: options.defaultInputModes ?? [...DEFAULT_A2A_MODES],
    defaultOutputModes: options.defaultOutputModes ?? [...DEFAULT_A2A_MODES],
    discovery: {
      protocol: "A2A",
      mechanism: "Agent Card",
    },
    capabilities: {
      streaming: options.streaming ?? false,
      pushNotifications: options.pushNotifications ?? false,
      stateTransitionHistory: false,
      extensions: [
        {
          uri: NLT_GOVERNANCE_EXTENSION_URI,
          description: "NeuroLift TOI/OTOI governance capabilities exposed by the ASFDK harness.",
          required: false,
          params: {
            agentToAgentDelegation: true,
            governedTaskExecution: true,
            humanInTheLoopApprovals: true,
            privacyFiltering: true,
          },
        },
      ],
    },
    governance: {
      toiPath: context.toiPath,
      otoiPath: context.otoiPath,
      toiAuthor: context.effectiveToi?.identity?.author,
      privacy: toPlainRecord(context.effectiveToi?.privacy),
      agency: toPlainRecord(context.effectiveToi?.agency),
      guardrails: stringArray(context.devOtoi?.guardrails),
      authority: {
        finalDecisionMaker: stringValue(authority?.final_decision_maker),
        escalationRule: stringValue(authority?.principle) ?? stringValue(authority?.escalation_rule),
      },
      otoi: context.effectivePolicy
        ? {
            version: context.charter?.$otoi,
            agents: context.effectivePolicy.agents.map((agent: any) => agent.id),
            tiers: context.effectivePolicy.tiers,
            enforcement: { ...context.effectivePolicy.enforcement },
            conflicts: context.effectivePolicy.conflicts.length,
          }
        : undefined,
    },
    skills,
    interopProtocols,
    metadata: {
      generatedAt: new Date().toISOString(),
      cwd: context.cwd,
      protocolSurface: snapshot.protocols,
      diagnostics,
    },
  };
}

/**
 * Server-set issuance record of a card the harness issued to a connected agent
 * (THREAD-019). `verified` fields come from the encrypted grant; `observed`
 * fields come from request headers the client sends.
 */
export interface A2ACardIssuance {
  issuer: "asfdk-harness";
  surface: CardSurface;
  issuedAt: string;
  authorization: { agentId: string; platform: string; authMethod: string };
  observedClient: string;
  verified: ["agentId"];
  observed: ["observedClient"];
  declared: string[];
  revision: number;
  updatedAt: string;
}

/** Governance posture only: no TOI contents, author, paths or tool list (PR #39 review H7). */
export interface A2AGovernancePosture {
  guardrails: string[];
  authority: {
    finalDecisionMaker?: string;
    escalationRule?: string;
  };
  otoi:
    | {
        version?: string;
        enforcement?: Record<string, unknown>;
        /** Whether this agentId is listed in the OTOI charter's agents. */
        registered: boolean;
      }
    | undefined;
}

export type IssuedA2AAgentCard = Omit<A2AAgentCard, "governance" | "interopProtocols" | "metadata"> & {
  governance: A2AGovernancePosture;
  issuance: A2ACardIssuance;
  metadata: {
    generatedAt: string;
    diagnostics: string[];
  };
};

export interface IssuedA2AAgentCardOptions {
  agentId: string;
  agentName: string;
  issuance: A2ACardIssuance;
  description?: string;
  url?: string;
  version?: string;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  streaming?: boolean;
  pushNotifications?: boolean;
  /** Replaces the harness tool list; issued cards list none unless the agent declares its own. */
  skills?: A2ASkill[];
  /** Redacts paths in diagnostics before they reach the card. */
  redactDiagnostic?: (diagnostic: string) => string;
}

/**
 * The card the harness issues to a connected agent. Built on
 * {@link createA2AAgentCard} with the agent's options, then narrowed: posture-only
 * governance, the agent's own skills, no interop list, no `cwd`, and the issuance
 * record. The governance block is regenerated from the current TOI/OTOI on
 * every call, so a charter change reaches existing cards.
 */
export function createIssuedA2AAgentCard(
  context: GovernanceProtocolContext,
  options: IssuedA2AAgentCardOptions,
): IssuedA2AAgentCard {
  const base = createA2AAgentCard(context, {
    agentId: options.agentId,
    agentName: options.agentName,
    description: options.description ?? `${options.agentName} connected to the ASFDK harness.`,
    // Never fall back to the harness's own ASFDK_A2A_URL: an empty URL means the
    // agent receives messages through the hub inbox.
    url: options.url ?? "",
    version: options.version ?? "0.0.0",
    protocolVersion: A2A_PROTOCOL_VERSION,
    preferredTransport: "JSONRPC",
    defaultInputModes: options.defaultInputModes,
    defaultOutputModes: options.defaultOutputModes,
    streaming: options.streaming,
    pushNotifications: options.pushNotifications,
    includeSensitiveGovernanceTools: false,
  });

  const redact = options.redactDiagnostic ?? ((diagnostic: string) => diagnostic);
  const registeredAgents = base.governance.otoi?.agents ?? [];
  const { governance: _fullGovernance, interopProtocols: _interop, metadata, skills: _harnessSkills, ...rest } = base;

  return {
    ...rest,
    capabilities: {
      ...base.capabilities,
      extensions: [
        {
          uri: NLT_GOVERNANCE_EXTENSION_URI,
          description:
            "Governance posture of the connection this card was issued to. The ASFDK hub governs the messages it routes; it does not govern the agent's own runtime.",
          required: false,
          params: {
            identity: "server-issued",
            governedHubMessaging: true,
            agentRuntimeGoverned: false,
          },
        },
      ],
    },
    governance: {
      guardrails: base.governance.guardrails,
      authority: base.governance.authority,
      otoi: base.governance.otoi
        ? {
            version: base.governance.otoi.version,
            enforcement: base.governance.otoi.enforcement,
            registered: registeredAgents.includes(options.agentId),
          }
        : undefined,
    },
    skills: (options.skills ?? []).map((skill) => ({ ...skill, tags: [...skill.tags] })),
    issuance: options.issuance,
    metadata: {
      generatedAt: metadata.generatedAt,
      // The endpoint-URL hint is about the harness's own card; an issued card
      // without a URL is normal (hub inbox delivery).
      diagnostics: metadata.diagnostics.filter((d) => !d.startsWith("A2A Agent Card has no service endpoint URL")).map(redact),
    },
  };
}

export function getA2ASkillIds(options: Pick<A2AAgentCardOptions, "includeSensitiveGovernanceTools"> = {}): string[] {
  return buildA2ASkills(options.includeSensitiveGovernanceTools ?? false).map((skill) => skill.id);
}

function buildA2ASkills(includeSensitiveGovernanceTools: boolean): A2ASkill[] {
  // Derived from the Pi tool catalog and filtered by the same gate as runtime tool exposure.
  return ASFDK_TOOL_SKILLS.filter(
    (skill) => includeSensitiveGovernanceTools || !isSensitiveGovernanceToolName(skill.toolName),
  ).map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: [...skill.tags],
  }));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toPlainRecord(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return record ? { ...record } : undefined;
}
