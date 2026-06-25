import { createProtocolSnapshot, type GovernanceProtocolContext, type ThirdPartyProtocolProfile } from "./protocols.js";

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
}

export interface A2AAgentCardOptions {
  agentId?: string;
  agentName?: string;
  description?: string;
  url?: string;
  version?: string;
}

export interface A2AAgentCard {
  kind: "a2a-agent-card";
  id: string;
  name: string;
  description: string;
  version: string;
  url?: string;
  discovery: {
    protocol: "A2A";
    mechanism: "Agent Card";
  };
  transport: {
    protocol: "JSON-RPC 2.0";
    transport: "HTTP(S)";
    streaming: boolean;
    notifications: boolean;
  };
  capabilities: {
    agentToAgentDelegation: boolean;
    governedTaskExecution: boolean;
    humanInTheLoopApprovals: boolean;
    privacyFiltering: boolean;
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

export function createA2AAgentCard(
  context: GovernanceProtocolContext,
  options: A2AAgentCardOptions = {},
): A2AAgentCard {
  const snapshot = createProtocolSnapshot(context);
  const interopProtocols = snapshot.thirdPartyProtocols.filter((protocol) => protocol.status !== "separate-owner");
  const skills = buildA2ASkills();
  const authority = asRecord(context.devOtoi?.authority);

  return {
    kind: "a2a-agent-card",
    id: options.agentId ?? "asfdk-harness",
    name: options.agentName ?? "ASFDK Harness",
    description:
      options.description ??
      "Governed Pi harness for TOI/OTOI-aware agent delegation and third-party interoperability.",
    version: options.version ?? "0.1.0",
    url: options.url,
    discovery: {
      protocol: "A2A",
      mechanism: "Agent Card",
    },
    transport: {
      protocol: "JSON-RPC 2.0",
      transport: "HTTP(S)",
      streaming: true,
      notifications: true,
    },
    capabilities: {
      agentToAgentDelegation: true,
      governedTaskExecution: true,
      humanInTheLoopApprovals: true,
      privacyFiltering: true,
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
            agents: context.effectivePolicy.agents.map((agent) => agent.id),
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
      diagnostics: context.diagnostics,
    },
  };
}

export function getA2ASkillIds(): string[] {
  return buildA2ASkills().map((skill) => skill.id);
}

function buildA2ASkills(): A2ASkill[] {
  return [
    {
      id: "asfdk.status",
      name: "ASFDK status",
      description: "Inspect foundation health, governance state, and loaded protocol context.",
    },
    {
      id: "asfdk.protocol_status",
      name: "ASFDK protocol status",
      description: "Inspect local TOI/OTOI resolution and non-MCP protocol loading.",
    },
    {
      id: "asfdk.assess_text",
      name: "ASFDK assess text",
      description: "Run governed text assessment through the active ASFDK foundation.",
    },
    {
      id: "asfdk.preference_update",
      name: "ASFDK preference update",
      description: "Validate and update user preferences through TOI/OTOI enforcement.",
    },
    {
      id: "asfdk.governed_pi_task",
      name: "Governed Pi task",
      description: "Execute a Pi-mediated task after policy preflight and governance checks.",
    },
  ];
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
