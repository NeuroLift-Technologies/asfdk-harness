import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createFoundation, FoundationMode, InteractionType, Channel } from "@neurolift-technologies/asfdk";

// ---------------------------------------------------------------------------
// OpenClaw peer dependency check
// ---------------------------------------------------------------------------

try {
  // Verify OpenClaw is available at import time
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
  /** Enable enforcement mode (returns gate decisions). Default: false (logging only). */
  enforcement: boolean;
  /** Maximum text length to assess (chars). */
  maxAssessLength: number;
}

const DEFAULT_CONFIG: PluginConfig = {
  enforcement: false,
  maxAssessLength: 4000,
};

// ---------------------------------------------------------------------------
// Foundation singleton
// ---------------------------------------------------------------------------

let foundation: ReturnType<typeof createFoundation> extends Promise<infer T> ? T : never;
let initialized = false;
let initFailed = false;
let config: PluginConfig = { ...DEFAULT_CONFIG };

async function getFoundation() {
  if (initialized || initFailed) return foundation;

  try {
    foundation = await createFoundation("openclaw-user", FoundationMode.UNIFIED);
    initialized = true;
    console.log("[asfdk-deploy] Foundation initialized in UNIFIED mode");
  } catch (err) {
    initFailed = true;
    console.error("[asfdk-deploy] FATAL: Foundation init failed — governance is DISABLED", err);
  }

  return foundation;
}

// ---------------------------------------------------------------------------
// Assessment result type
// ---------------------------------------------------------------------------

interface AssessmentResult {
  /** Whether the hook should block the action. */
  block: boolean;
  /** Crisis level from RRT Advocate (if any). */
  crisisLevel: string;
  /** Human-readable reason for the decision. */
  reason: string;
}

const NO_BLOCK: AssessmentResult = { block: false, crisisLevel: "", reason: "" };

// ---------------------------------------------------------------------------
// Hallucination / fallback-language detection
//
// NOTE: These patterns are English-only. Non-English fallback language or
// stylistic variations will be missed. A model-backed classifier should be
// used if reliable cross-language detection is required.
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
// Core assessment
// ---------------------------------------------------------------------------

async function assess(
  text: string,
  channel: Channel,
  source: string,
  identity?: { userId?: string; sessionId?: string },
): Promise<AssessmentResult> {
  if (!text) return NO_BLOCK;

  const f = await getFoundation();
  if (!f) {
    // Foundation not available — log warning, do not block
    if (!initFailed) {
      console.warn("[asfdk-deploy] Foundation not available for assessment", { source });
    }
    return NO_BLOCK;
  }

  try {
    const interaction = await f.processInteraction({
      timestamp: new Date(),
      interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
      data: { text: text.slice(0, config.maxAssessLength), source },
      userId: identity?.userId ?? "openclaw-user",
      sessionId: identity?.sessionId ?? "openclaw-session",
      channel,
    });

    const content: any = (interaction as any)?.content ?? {};
    const crisisLevel: string = content?.rrt?.crisisLevel ?? "";
    const HIGH_RISK = new Set(["high", "elevated", "emergency"]);
    const emotional = content?.emotionalState ?? {};
    const isHighRisk =
      HIGH_RISK.has(crisisLevel.toLowerCase()) ||
      Boolean(emotional?.requiresCheckIn) ||
      Boolean(emotional?.selfHarm);

    if (isHighRisk) {
      const reason = `Crisis level: ${crisisLevel}, requiresCheckIn: ${emotional?.requiresCheckIn}, selfHarm: ${emotional?.selfHarm}`;
      console.log(`[asfdk-deploy] gate-up channel=${channel} source=${source} ${reason} — escalate to Joshua W. Dorsey, Sr.`);
      return { block: config.enforcement, crisisLevel, reason };
    }

    // Hallucination check (replies only)
    if (channel === Channel.MODEL_OUTPUT && text && replyLooksUnsupported(text)) {
      const reason = "Reply contains unsupported/fallback language patterns";
      console.log(`[asfdk-deploy] unsupported-claim channel=${channel} source=${source} — escalate to Joshua W. Dorsey, Sr.`);
      return { block: config.enforcement, crisisLevel: "", reason };
    }
  } catch (err) {
    console.error(`[asfdk-deploy] assessment-error channel=${channel} source=${source}`, err);
  }

  return NO_BLOCK;
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

export default definePluginEntry({
  id: "asfdk-deploy",
  name: "ASFDK Deploy",
  description:
    "Integrates the ASFDK Solidarity Layer into OpenClaw. Observes agent turns, tool calls, and messages through TOI/OTOI, RRT Advocate, and Sleepwalker Protocol. Supports logging-only (default) or enforcement mode via config.",
  version: "0.1.0",

  register(api) {
    // Merge user config
    try {
      const userConfig = (api as any)?.config ?? {};
      config = { ...DEFAULT_CONFIG, ...userConfig };
    } catch {
      // Config not available — use defaults
    }

    if (config.enforcement) {
      console.log("[asfdk-deploy] Running in ENFORCEMENT mode — hooks may block actions");
    } else {
      console.log("[asfdk-deploy] Running in LOGGING-ONLY mode — hooks observe but do not block");
    }

    api.on("gateway_start", async () => {
      await getFoundation();
    });

    api.on("message_received", async (event) => {
      const content =
        typeof event.content === "string"
          ? event.content
          : JSON.stringify(event.content ?? "");
      await assess(
        content,
        Channel.USER_INPUT,
        `message:${event.senderId ?? "unknown"}`,
        { userId: event.senderId, sessionId: event.sessionId },
      );
    });

    api.on("before_tool_call", async (event) => {
      // NOTE: OpenClaw's before_tool_call hook does not support async
      // cancellation from this hook shape. Assessment is observation-only
      // regardless of enforcement config. Enforcement only applies to hooks
      // that support returning a stop decision (before_agent_reply).
      const params =
        typeof event.params === "string"
          ? event.params
          : JSON.stringify(event.params ?? {});
      await assess(
        params,
        Channel.TOOL_RESULT,
        `tool:${event.toolName ?? "unknown"}`,
        { userId: event.agentId, sessionId: event.sessionId },
      );
    });

    api.on("before_agent_reply", async (event) => {
      const reply =
        typeof event.cleanedBody === "string" ? event.cleanedBody : "";
      const result = await assess(
        reply,
        Channel.MODEL_OUTPUT,
        "agent:reply",
        { userId: event.agentId, sessionId: event.sessionId },
      );

      if (result.block) {
        console.log(
          `[asfdk-deploy] BLOCKED reply: ${result.reason} — escalate to Joshua W. Dorsey, Sr.`
        );
        // NOTE: If OpenClaw supports returning a stop decision from
        // before_agent_reply, this is where it would be returned.
        // Currently the plugin is observation-only by design.
      }
    });
  },
});
