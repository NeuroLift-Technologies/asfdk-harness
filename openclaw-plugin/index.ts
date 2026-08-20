import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createFoundation, FoundationMode, InteractionType, Channel, type NeuroLiftFoundation, type FoundationResponse } from "@neurolift-technologies/asfdk";

// ---------------------------------------------------------------------------
// OpenClaw peer dependency check
// ---------------------------------------------------------------------------

try {
  await import("openclaw");
} catch {
  console.error(
    "[asfdk-deploy] FATAL: openclaw peer dependency not found. " +
    "Install openclaw (>=2026.3.24-beta.2) before using this plugin."
  );
  throw new Error("Missing peer dependency: openclaw");
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface PluginConfig {
  /** Maximum text length to assess (chars). */
  maxAssessLength: number;
}

const DEFAULT_CONFIG: PluginConfig = {
  maxAssessLength: 4000,
};

// ---------------------------------------------------------------------------
// Foundation singleton — serialized initialization
//
// Concurrent hook callbacks share a single promise to prevent duplicate
// foundation allocation. The foundation is created once and reused.
// ---------------------------------------------------------------------------

let foundation: NeuroLiftFoundation | undefined;
let initPromise: Promise<NeuroLiftFoundation | undefined> | null = null;
let initFailed = false;
let config: PluginConfig = { ...DEFAULT_CONFIG };

async function getFoundation(): Promise<NeuroLiftFoundation | undefined> {
  if (foundation) return foundation;
  if (initFailed) return undefined;

  // Serialize: concurrent callers share the same init promise
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const f = await createFoundation("openclaw-plugin", FoundationMode.UNIFIED);
        foundation = f;
        console.log("[asfdk-deploy] Foundation initialized in UNIFIED mode");
        return f;
      } catch (err) {
        initFailed = true;
        console.error("[asfdk-deploy] FATAL: Foundation init failed — governance is DISABLED", err);
        return undefined;
      }
    })();
  }

  return initPromise;
}

// ---------------------------------------------------------------------------
// Assessment result type
// ---------------------------------------------------------------------------

interface AssessmentResult {
  /** Crisis level from RRT Advocate (if any). */
  crisisLevel: string;
  /** Human-readable reason for the finding. */
  reason: string;
  /** Whether this was a high-risk finding. */
  highRisk: boolean;
}

const NO_FINDING: AssessmentResult = { crisisLevel: "", reason: "", highRisk: false };

// ---------------------------------------------------------------------------
// Hallucination / fallback-language detection
//
// LANGUAGE SCOPE: These patterns are English-only. They detect common
// English phrases that indicate the model is fabricating, simulating, or
// fallback-ing when it cannot access real data. Non-English fallback
// language or stylistic variations will NOT be detected. For reliable
// cross-language detection, a model-backed classifier is required.
// ---------------------------------------------------------------------------

const FABRICATION_PATTERNS: RegExp[] = [
  /i (?:can'?t|cannot|can not) (?:access|read|open|directly access|verify)/i,
  /i'?ll (?:simulate|guess|make up|fabricate|invent|mock up)/i,
  /since i (?:can'?t|cannot)/i,
  /a (?:typical|representative|standard) .* (?:might|may|would) contain/i,
  /i'?m (?:not able|unable) to (?:access|read|verify)/i,
  /without (?:actually |really )?(?:reading|checking|running|accessing|executing)/i,
  /based on (?:standard|typical|common|usual) .* (?:structure|setup|config|layout)/i,
  /(?:made up|fabricated|invented|guessed|simulated) (?:the |these |this |our |a )?(?:contents?|file|files|response|answer|output|config)/i,
  /so i (?:made up|fabricated|invented|guessed|simulated)/i,
];

function replyLooksUnsupported(reply: string): boolean {
  return FABRICATION_PATTERNS.some((re) => re.test(reply));
}

// ---------------------------------------------------------------------------
// Core assessment — observation-only
//
// This plugin is MONITOR-ONLY. It observes and logs governance signals but
// does NOT block or modify agent actions. For enforcement mode, use the
// full ASFDK harness extension.
// ---------------------------------------------------------------------------

async function assess(
  text: string,
  channel: Channel,
  source: string,
  identity: { userId: string; sessionId: string },
): Promise<AssessmentResult> {
  if (!text) return NO_FINDING;

  const f = await getFoundation();
  if (!f) {
    console.warn("[asfdk-deploy] Foundation not available for assessment", { source });
    return NO_FINDING;
  }

  try {
    const interaction: FoundationResponse = await f.processInteraction({
      timestamp: new Date(),
      interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
      data: { text: text.slice(0, config.maxAssessLength), source },
      userId: identity.userId,
      sessionId: identity.sessionId,
      channel,
    });

    // Check for component failures before extracting content
    if (interaction.content?.error) {
      console.error(
        `[asfdk-deploy] component-error channel=${channel} source=${source}`,
        interaction.content.error,
      );
      return NO_FINDING;
    }

    const content: Record<string, unknown> = interaction.content ?? {};
    const crisisLevel: string = (content.rrt as Record<string, unknown>)?.crisisLevel as string ?? "";
    const HIGH_RISK = new Set(["high", "elevated", "emergency"]);
    const emotional = (content.emotionalState as Record<string, unknown>) ?? {};
    const isHighRisk =
      HIGH_RISK.has(crisisLevel.toLowerCase()) ||
      Boolean(emotional.requiresCheckIn) ||
      Boolean(emotional.selfHarm);

    if (isHighRisk) {
      const reason = `Crisis level: ${crisisLevel}, requiresCheckIn: ${emotional.requiresCheckIn}, selfHarm: ${emotional.selfHarm}`;
      console.log(`[asfdk-deploy] HIGH-RISK channel=${channel} source=${source} ${reason} — escalate to Joshua W. Dorsey, Sr.`);
      return { crisisLevel, reason, highRisk: true };
    }

    // Hallucination check (replies only, ENGLISH-ONLY — see FABRICATION_PATTERNS docstring)
    if (channel === Channel.MODEL_OUTPUT && text && replyLooksUnsupported(text)) {
      const reason = "Reply contains unsupported/fallback language patterns (English-only detection)";
      console.log(`[asfdk-deploy] UNSUPPORTED-CLAIM channel=${channel} source=${source} — escalate to Joshua W. Dorsey, Sr.`);
      return { crisisLevel: "", reason, highRisk: true };
    }
  } catch (err) {
    console.error(`[asfdk-deploy] assessment-error channel=${channel} source=${source}`, err);
  }

  return NO_FINDING;
}

// ---------------------------------------------------------------------------
// Plugin entry — MONITOR-ONLY
// ---------------------------------------------------------------------------

export default definePluginEntry({
  id: "asfdk-deploy",
  name: "ASFDK Deploy (Monitor-Only)",
  description:
    "MONITOR-ONLY integration of the ASFDK Solidarity Layer into OpenClaw. " +
    "Observes agent turns, tool calls, and messages through TOI/OTOI, RRT Advocate, " +
    "and Sleepwalker Protocol. Logs escalation signals but does NOT block or modify actions. " +
    "For enforcement mode, use the full ASFDK harness extension.",
    register(api) {
      // Merge user config
      try {
        const userConfig = (api as { config?: Partial<PluginConfig> })?.config ?? {};
        config = { ...DEFAULT_CONFIG, ...userConfig };
      } catch {
        // Config not available — use defaults
      }

    console.log("[asfdk-deploy] Running in MONITOR-ONLY mode — hooks observe but do not block");

    api.on("gateway_start", async () => {
      await getFoundation();
    });

    api.on("message_received", async (event, ctx) => {
      // Identity: the inbound sender is event.senderId ?? event.from. The event
      // has no sessionId — the canonical conversation session lives on ctx.sessionKey.
      const userId = event.senderId ?? event.from;
      const sessionId = ctx.sessionKey ?? event.sessionKey ?? (typeof event.threadId === "string" ? event.threadId : undefined) ?? (typeof event.runId === "string" ? event.runId : undefined);
      if (!userId || !sessionId) {
        console.warn("[asfdk-deploy] skipping message_received: missing sender or session identity");
        return;
      }
      const content =
        typeof event.content === "string"
          ? event.content
          : JSON.stringify(event.content ?? "");
      await assess(
        content,
        Channel.USER_INPUT,  // Incoming peer messages are user-origin input, not model output
        `message:${userId}`,
        { userId, sessionId },
      );
    });

    api.on("before_tool_call", async (event, ctx) => {
      // NOTE: OpenClaw's before_tool_call hook does not support async
      // cancellation from this hook shape. Assessment is observation-only.
      // Tool-call events carry no identity on the event itself; derive it from ctx.
      const userId = ctx.agentId;
      const sessionId = ctx.sessionId ?? ctx.sessionKey ?? ctx.runId;
      if (!userId || !sessionId) {
        console.warn("[asfdk-deploy] skipping before_tool_call: missing agentId or session identity");
        return;
      }
      const params =
        typeof event.params === "string"
          ? event.params
          : JSON.stringify(event.params ?? {});
      await assess(
        params,
        Channel.TOOL_RESULT,  // Tool call arguments are assessed on the tool-result channel
        `tool:${event.toolName ?? "unknown"}`,
        { userId, sessionId },
      );
    });

    api.on("before_agent_reply", async (event, ctx) => {
      // NOTE: This hook is observation-only. Even if a high-risk finding is
      // detected, the reply is NOT blocked. The signal is logged for human
      // review. For enforcement, use the full ASFDK harness extension.
      // Reply events carry only cleanedBody; derive identity from ctx.
      const userId = ctx.agentId ?? ctx.senderId;
      const sessionId = ctx.sessionId ?? ctx.sessionKey ?? ctx.runId;
      if (!userId || !sessionId) {
        console.warn("[asfdk-deploy] skipping before_agent_reply: missing agentId or session identity");
        return;
      }
      const reply =
        typeof event.cleanedBody === "string" ? event.cleanedBody : "";
      const result = await assess(
        reply,
        Channel.MODEL_OUTPUT,
        "agent:reply",
        { userId, sessionId },
      );

      if (result.highRisk) {
        console.log(
          `[asfdk-deploy] HIGH-RISK REPLY DETECTED: ${result.reason} — escalate to Joshua W. Dorsey, Sr.`
        );
      }
    });
  },
});
