import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createProtocolSnapshot,
  formatProtocolSystemPrompt,
  loadGovernanceProtocols,
  type GovernanceProtocolContext,
  type GovernanceProtocolSnapshot,
  type PromptMode,
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
  /** Inline TOI JSON string — bypasses filesystem read (used in Workers environment). */
  toiContent?: string;
  /** Inline OTOI JSON string — bypasses filesystem read (used in Workers environment). */
  otoiContent?: string;
  /** Public A2A service endpoint URL advertised on the generated Agent Card. */
  a2aUrl?: string;
  /** Protocol system prompt verbosity: compact (default, ~5 lines) or full (verbose). */
  promptMode?: PromptMode;
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
  readonly toiContent: string | undefined;
  readonly otoiContent: string | undefined;
  readonly a2aUrl: string | undefined;
  readonly promptMode: PromptMode;

  #foundation: NeuroLiftFoundation | undefined;
  #protocolContext: GovernanceProtocolContext | undefined;

  constructor(options: AsfdkHarnessOptions = {}) {
    this.userId = options.userId ?? process.env.ASFDK_USER_ID ?? "asfdk-user";
    this.sessionId = options.sessionId ?? process.env.ASFDK_SESSION_ID ?? randomUUID();
    this.mode = options.mode ?? parseFoundationMode(process.env.ASFDK_MODE) ?? FoundationMode.UNIFIED;
    this.cwd = options.cwd ?? process.cwd();
    this.toiPath = options.toiPath ?? process.env.ASFDK_TOI_PATH;
    this.otoiPath = options.otoiPath ?? process.env.ASFDK_OTOI_PATH;
    this.toiContent = options.toiContent ?? process.env.ASFDK_TOI_CONTENT;
    this.otoiContent = options.otoiContent ?? process.env.ASFDK_OTOI_CONTENT;
    this.a2aUrl = options.a2aUrl ?? process.env.ASFDK_A2A_URL;
    this.promptMode = options.promptMode ?? parsePromptMode(process.env.ASFDK_PROMPT_MODE) ?? "compact";
  }

  async start(): Promise<void> {
    if (this.#foundation) return;
    // Pre-create .swp_storage so the sleepwalker-protocol's ContinuityManager
    // doesn't throw EPERM on a read-only assessment. The external package tries
    // mkdir on construction; handle permission denial gracefully by falling back
    // to a temp directory.
    try {
      mkdirSync(join(this.cwd, ".swp_storage"), { recursive: true });
    } catch {
      try {
        mkdirSync("/tmp/.swp_storage", { recursive: true });
      } catch {
        // Neither CWD nor /tmp is writable — assessment will degrade
        // gracefully via the processInteraction error boundary.
      }
    }
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
    let emotionalState: unknown = null;
    try {
      emotionalState = await foundation.assessEmotionalState(text, context);
    } catch (error) {
      emotionalState = { error: "emotional-assessment-unavailable", detail: String(error) };
    }

    try {
      const interaction = await foundation.processInteraction({
        timestamp: new Date(),
        interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
        data: { text, emotionalState },
        userId: this.userId,
        sessionId: this.sessionId,
        context,
      });
      if (interaction?.content?.error) {
        interaction.success = false;
      }
      return { interaction, emotionalState };
    } catch (error) {
      return {
        interaction: {
          success: false,
          responseType: InteractionType.EMOTIONAL_ASSESSMENT,
          componentsInvolved: ["asfdk_foundation"],
          content: { error: { component: "asfdk_foundation", message: String(error) }, data: { text } },
          timestamp: new Date().toISOString(),
        },
        emotionalState,
      };
    }
  }

  async processInteraction(
    interactionType: string,
    data: Record<string, unknown>,
    context: Record<string, unknown> = {},
  ): Promise<FoundationResponse> {
    const foundation = await this.foundation();
    try {
      const response = await foundation.processInteraction({
        timestamp: new Date(),
        interactionType,
        data,
        userId: this.userId,
        sessionId: this.sessionId,
        context,
      });
      // Bug B: set success=false when any component reported an error
      if (response?.content?.error) {
        return { ...response, success: false };
      }
      return response;
    } catch (error) {
      // Bug A: return structured response instead of throwing on foundation failure
      return {
        success: false,
        responseType: interactionType,
        componentsInvolved: ["asfdk_foundation"],
        content: {
          error: { component: "asfdk_foundation", message: String(error) },
          data,
        },
        timestamp: new Date().toISOString(),
      };
    }
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
      toiContent: this.toiContent,
      otoiContent: this.otoiContent,
    });
    return this.#protocolContext;
  }

  async protocolSnapshot(cwd?: string): Promise<GovernanceProtocolSnapshot> {
    return createProtocolSnapshot(await this.protocolContext(cwd));
  }

  async protocolSystemPrompt(cwd?: string, promptMode?: PromptMode): Promise<string> {
    return formatProtocolSystemPrompt(await this.protocolContext(cwd), promptMode ?? this.promptMode);
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

    return text
      .replace(/(^|[\s([{:;,"'])((?:\/[A-Za-z0-9._-]+){2,})(?=$|[\s)\]}:;,"'])/g, "$1[REDACTED_PATH]")
      .replace(/\b[A-Za-z]:\\[A-Za-z0-9._-]+(?:\\[A-Za-z0-9._-]+)+\b/g, "[REDACTED_PATH]");
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

export function parsePromptMode(value: string | undefined): PromptMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "compact" || normalized === "full") return normalized;
  return undefined;
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
