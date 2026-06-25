import {
  createFoundation,
  FoundationMode,
  InteractionType,
  type FoundationResponse,
  type HealthCheckResult,
  type NeuroLiftFoundation,
} from "@neurolift-technologies/asfdk";
import { randomUUID } from "node:crypto";
import {
  createProtocolSnapshot,
  formatProtocolSystemPrompt,
  loadGovernanceProtocols,
  type GovernanceProtocolContext,
  type GovernanceProtocolSnapshot,
} from "./protocols.js";
import { createA2AAgentCard, type A2AAgentCard } from "./a2a.js";

export interface AsfdkHarnessOptions {
  userId?: string;
  sessionId?: string;
  mode?: FoundationMode;
  cwd?: string;
  toiPath?: string;
  otoiPath?: string;
}

export interface TextAssessment {
  interaction: FoundationResponse;
  emotionalState: unknown;
}

export class AsfdkHarness {
  readonly userId: string;
  readonly sessionId: string;
  readonly mode: FoundationMode;
  readonly cwd: string;
  readonly toiPath: string | undefined;
  readonly otoiPath: string | undefined;

  #foundation: NeuroLiftFoundation | undefined;
  #protocolContext: GovernanceProtocolContext | undefined;

  constructor(options: AsfdkHarnessOptions = {}) {
    this.userId = options.userId ?? process.env.ASFDK_USER_ID ?? "pi-user";
    this.sessionId = options.sessionId ?? process.env.PI_SESSION_ID ?? randomUUID();
    this.mode = options.mode ?? parseFoundationMode(process.env.ASFDK_MODE) ?? FoundationMode.UNIFIED;
    this.cwd = options.cwd ?? process.cwd();
    this.toiPath = options.toiPath ?? process.env.ASFDK_TOI_PATH;
    this.otoiPath = options.otoiPath ?? process.env.ASFDK_OTOI_PATH;
  }

  async start(): Promise<void> {
    if (this.#foundation) return;
    this.#foundation = await createFoundation(this.userId, this.mode);
  }

  async shutdown(): Promise<void> {
    await this.#foundation?.shutdown();
    this.#foundation = undefined;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const foundation = await this.foundation();
    return foundation.healthCheck();
  }

  async status(): Promise<Record<string, unknown>> {
    const foundation = await this.foundation();
    const [status, protocols] = await Promise.all([foundation.getSystemStatus(), this.protocolSnapshot()]);
    return { ...status, protocols };
  }

  async assessText(text: string, context: Record<string, unknown> = {}): Promise<TextAssessment> {
    const foundation = await this.foundation();
    const emotionalState = await foundation.assessEmotionalState(text, context);
    const interaction = await foundation.processInteraction({
      timestamp: new Date(),
      interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
      data: { text, emotionalState },
      userId: this.userId,
      sessionId: this.sessionId,
      context,
    });

    return { interaction, emotionalState };
  }

  async processInteraction(
    interactionType: InteractionType,
    data: Record<string, unknown>,
    context: Record<string, unknown> = {},
  ): Promise<FoundationResponse> {
    const foundation = await this.foundation();
    return foundation.processInteraction({
      timestamp: new Date(),
      interactionType,
      data,
      userId: this.userId,
      sessionId: this.sessionId,
      context,
    });
  }

  async updatePreferences(preferences: Record<string, unknown>): Promise<void> {
    const foundation = await this.foundation();
    await foundation.updatePreferences(preferences);
  }

  async protocolContext(cwd?: string, force = false): Promise<GovernanceProtocolContext> {
    const targetCwd = cwd ?? this.#protocolContext?.cwd ?? this.cwd;
    if (!force && this.#protocolContext?.cwd === targetCwd) return this.#protocolContext;
    this.#protocolContext = await loadGovernanceProtocols({
      cwd: targetCwd,
      toiPath: this.toiPath,
      otoiPath: this.otoiPath,
    });
    return this.#protocolContext;
  }

  async protocolSnapshot(cwd?: string): Promise<GovernanceProtocolSnapshot> {
    return createProtocolSnapshot(await this.protocolContext(cwd));
  }

  async protocolSystemPrompt(cwd?: string): Promise<string> {
    return formatProtocolSystemPrompt(await this.protocolContext(cwd));
  }

  async a2aAgentCard(cwd?: string): Promise<A2AAgentCard> {
    return createA2AAgentCard(await this.protocolContext(cwd), {
      agentId: "asfdk-harness",
      agentName: "ASFDK Harness",
    });
  }

  async foundation(): Promise<NeuroLiftFoundation> {
    if (!this.#foundation) await this.start();
    if (!this.#foundation) throw new Error("ASFDK foundation failed to initialize");
    return this.#foundation;
  }
}

export function parseFoundationMode(value: string | undefined): FoundationMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return Object.values(FoundationMode).find((mode) => mode === normalized);
}

export function summarizeFoundationResponse(response: FoundationResponse): string {
  return JSON.stringify(
    {
      success: response.success,
      responseType: response.responseType,
      componentsInvolved: response.componentsInvolved,
      content: response.content,
      timestamp: response.timestamp,
    },
    null,
    2,
  );
}
