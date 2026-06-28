import { randomUUID } from "node:crypto";
import {
  createProtocolSnapshot,
  formatProtocolSystemPrompt,
  loadGovernanceProtocols,
  type GovernanceProtocolContext,
  type GovernanceProtocolSnapshot,
} from "./protocols.js";
import { createA2AAgentCard, type A2AAgentCard } from "./a2a.js";
import { loadAsfdk } from "./asfdk-runtime.js";

export const FoundationMode = {
  UNIFIED: "unified",
  CRISIS_ONLY: "crisis-only",
  CONTINUITY_ONLY: "continuity-only",
  FRAMEWORK_ONLY: "framework-only",
  DEVELOPMENT: "development",
} as const;
export type FoundationMode = (typeof FoundationMode)[keyof typeof FoundationMode];
export const InteractionType = {
  EMOTIONAL_ASSESSMENT: "emotional_assessment",
  CRISIS_ALERT: "crisis_alert",
  PREFERENCE_UPDATE: "preference_update",
  OPTIMIZATION_REQUEST: "optimization_request",
  STATUS_INQUIRY: "status_inquiry",
  EMERGENCY_ESCALATION: "emergency_escalation",
} as const;
export type FoundationResponse = any;
export type HealthCheckResult = any;
type NeuroLiftFoundation = any;

export interface AsfdkHarnessOptions {
  userId?: string;
  sessionId?: string;
  mode?: FoundationMode;
  cwd?: string;
  toiPath?: string;
  otoiPath?: string;
  /** Public A2A service endpoint URL advertised on the generated Agent Card. */
  a2aUrl?: string;
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
  readonly a2aUrl: string | undefined;

  #foundation: NeuroLiftFoundation | undefined;
  #protocolContext: GovernanceProtocolContext | undefined;

  constructor(options: AsfdkHarnessOptions = {}) {
    this.userId = options.userId ?? process.env.ASFDK_USER_ID ?? "asfdk-user";
    this.sessionId = options.sessionId ?? process.env.ASFDK_SESSION_ID ?? randomUUID();
    this.mode = options.mode ?? parseFoundationMode(process.env.ASFDK_MODE) ?? FoundationMode.UNIFIED;
    this.cwd = options.cwd ?? process.cwd();
    this.toiPath = options.toiPath ?? process.env.ASFDK_TOI_PATH;
    this.otoiPath = options.otoiPath ?? process.env.ASFDK_OTOI_PATH;
    this.a2aUrl = options.a2aUrl ?? process.env.ASFDK_A2A_URL;
  }

  async start(): Promise<void> {
    if (this.#foundation) return;
    const { createFoundation } = await loadAsfdk();
    this.#foundation = await createFoundation(this.userId, this.mode as never);
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

    // Redact local filesystem paths unless in development mode
    const redactedProtocols =
      this.mode === FoundationMode.DEVELOPMENT ? protocols : this.redactProtocolPaths(protocols);

    return { ...status, protocols: redactedProtocols };
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
    interactionType: string,
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
      url: this.a2aUrl,
      includeSensitiveGovernanceTools: canExposeSensitiveGovernanceTools(this.mode),
    });
  }

  async foundation(): Promise<NeuroLiftFoundation> {
    if (!this.#foundation) await this.start();
    if (!this.#foundation) throw new Error("ASFDK foundation failed to initialize");
    return this.#foundation;
  }

  /**
   * Redact local filesystem paths from protocol snapshot for security
   * Replaces absolute paths with placeholders unless in development mode
   */
  redactProtocolPaths(snapshot: GovernanceProtocolSnapshot): GovernanceProtocolSnapshot {
    // Create a deep copy to avoid mutating the original
    const redacted: GovernanceProtocolSnapshot = {
      cwd: this.redactPath(snapshot.cwd),
      paths: {
        toi: this.redactPath(snapshot.paths.toi),
        otoi: this.redactPath(snapshot.paths.otoi),
      },
      protocols: [...snapshot.protocols],
      diagnostics: snapshot.diagnostics.map((diagnostic) =>
        typeof diagnostic === "string" ? this.redactPathInString(diagnostic) : diagnostic,
      ),
      toi: snapshot.toi,
      otoi: snapshot.otoi,
      thirdPartyProtocols: [...snapshot.thirdPartyProtocols],
    };

    return redacted;
  }

  /**
   * Redact a single filesystem path
   * Replaces absolute paths with [REDACTED_PATH] unless in development mode
   */
  redactPath(path: string): string {
    // Don't redact in development mode
    if (this.mode === FoundationMode.DEVELOPMENT) return path;

    // Check if this looks like an absolute path
    if (
      typeof path === "string" &&
      (path.startsWith("/") ||
        (path.length > 1 && path[1] === ":" && (path[2] === "\\" || path[2] === "/")))
    ) {
      return "[REDACTED_PATH]";
    }

    return path;
  }

  /**
   * Redact paths within a string (for diagnostics)
   * Preserves the rest of the message while redacting any paths
   */
  redactPathInString(text: string): string {
    // Don't redact in development mode
    if (this.mode === FoundationMode.DEVELOPMENT) return text;

    // Simple path pattern matching - this could be more sophisticated
    // Look for common path patterns and replace them
    return text
      .replace(/\b(\/[^\s]+|[A-Za-z]:\\[^\s]+|\/[^\s]+)/g, "[REDACTED_PATH]")
      .replace(/\b(\/\w+(\/\w+)+)/g, "[REDACTED_PATH]");
  }
}

export function canExposeSensitiveGovernanceTools(mode: FoundationMode): boolean {
  return mode === FoundationMode.DEVELOPMENT || process.env.ASFDK_GOVERNANCE_TOOLS === "approved";
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
