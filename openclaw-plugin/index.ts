import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createFoundation, FoundationMode, InteractionType, Channel } from "@neurolift-technologies/asfdk";

let foundation: ReturnType<typeof createFoundation> extends Promise<infer T> ? T : never;
let initialized = false;

async function getFoundation() {
  if (!initialized) {
    try {
      foundation = await createFoundation("openclaw-user", FoundationMode.UNIFIED);
      initialized = true;
      console.log("[asfdk-deploy] Foundation initialized in UNIFIED mode");
    } catch (err) {
      console.error("[asfdk-deploy] Failed to initialize foundation:", err);
    }
  }
  return foundation;
}

async function assess(text: string, channel: Channel, source: string) {
  if (!text) return;
  const f = await getFoundation();
  if (!f) return;

  try {
    const interaction = await f.processInteraction({
      timestamp: new Date(),
      interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
      data: { text: text.slice(0, 4000), source },
      userId: "openclaw-user",
      sessionId: "openclaw-session",
      channel,
    });

    // The foundation does NOT return a top-level `gateUp` field. The real
    // escalation signal lives in the response body:
    //   content.rrt.crisisLevel  -> "emergency" | "high" | ... (RRT advocate)
    //   content.emotionalState.requiresCheckIn / selfHarm -> boolean
    const content: any = (interaction as any)?.content ?? {};
    const crisisLevel: string = content?.rrt?.crisisLevel ?? "";
    const HIGH_RISK = new Set(["high", "elevated", "emergency"]);
    const emotional = content?.emotionalState ?? {};
    const gateUp =
      HIGH_RISK.has(crisisLevel.toLowerCase()) ||
      Boolean(emotional?.requiresCheckIn) ||
      Boolean(emotional?.selfHarm);
    if (gateUp) {
      console.log(`[asfdk-deploy] gate-up channel=${channel} source=${source} crisisLevel=${crisisLevel} — escalate to Joshua W. Dorsey, Sr.`);
    }
  } catch (err) {
    console.error(`[asfdk-deploy] assessment-error channel=${channel} source=${source}`, err);
  }
}

// Fabrication / fallback-language heuristics. Signals that a reply asserts
// things it cannot have verified — the hallucination class seen when the
// agent "simulated" file contents instead of reading them. This hook only
// receives the reply text, so detection is necessarily text-based.
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

export default definePluginEntry({
  id: "asfdk-deploy",
  name: "ASFDK Deploy",
  description: "Integrates the ASFDK Solidarity Layer into OpenClaw via the asfdk-deploy pathway.",
  version: "0.1.0",
  register(api) {
    api.on("gateway_start", async () => {
      await getFoundation();
    });

    api.on("message_received", async (event) => {
      const content = typeof event.content === "string" ? event.content : JSON.stringify(event.content ?? "");
      await assess(content, Channel.USER_INPUT, `message:${event.senderId ?? "unknown"}`);
    });

    api.on("before_tool_call", async (event) => {
      const params = typeof event.params === "string" ? event.params : JSON.stringify(event.params ?? {});
      await assess(params, Channel.TOOL_RESULT, `tool:${event.toolName ?? "unknown"}`);
    });

    api.on("before_agent_reply", async (event) => {
      // NOTE: the before_agent_reply hook only exposes `cleanedBody`
      // (the reply text). `event.prompt` does not exist on this type, so
      // the previous code assessed the literal "{}". Use the real text.
      const reply = typeof event.cleanedBody === "string" ? event.cleanedBody : "";
      await assess(reply, Channel.MODEL_OUTPUT, "agent:reply");

      // Hallucination/fallback guard: if the reply asserts unverified content
      // (e.g. "I can't access files, so I'll simulate what tools.md contains"),
      // raise a review gate. This is text-based only — the hook cannot see
      // whether tools were actually called this turn.
      if (reply && replyLooksUnsupported(reply)) {
        console.log("[asfdk-deploy] unsupported-claim in reply — escalate to Joshua W. Dorsey, Sr. (review agent output)");
      }
    });
  },
});
