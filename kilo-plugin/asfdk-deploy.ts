import type { Hooks, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import {
  Channel,
  createFoundation,
  FoundationMode,
  InteractionType,
  type NeuroLiftFoundation,
} from "@neurolift-technologies/asfdk";

interface AsfdkDeployOptions {
  userId?: string;
  mode?: FoundationMode;
  sessionId?: string;
  enableToolAssessment?: boolean;
  maxInputLength?: number;
  logPrefix?: string;
  verbose?: boolean;
}

const DEFAULT_OPTIONS: Required<AsfdkDeployOptions> = {
  userId: "opencode-user",
  mode: FoundationMode.UNIFIED,
  sessionId: "opencode-session",
  enableToolAssessment: true,
  maxInputLength: 4000,
  logPrefix: "asfdk-deploy",
  verbose: false,
};

const SEEN_CAP = 1000;

function extractText(parts: ReadonlyArray<{ type?: string; text?: unknown }>): string {
  return parts
    .filter((part): part is { type: string; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export default async function asfdkDeploy(_input: PluginInput, options: PluginOptions = {}): Promise<Hooks> {
  const opts = { ...DEFAULT_OPTIONS, ...options } as Required<AsfdkDeployOptions>;

  const log = (...args: unknown[]): void => {
    console.error(`[${opts.logPrefix}]`, ...args);
  };

  const seen = new Set<string>();
  let seenEvict: string[] = [];

  function remember(id: string): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    seenEvict.push(id);
    if (seenEvict.length > SEEN_CAP) {
      seen.delete(seenEvict.shift() as string);
    }
    return true;
  }

  let foundation: NeuroLiftFoundation | undefined;

  async function foundationReady(): Promise<NeuroLiftFoundation | undefined> {
    if (foundation) return foundation;
    try {
      foundation = await createFoundation({ userId: opts.userId, mode: opts.mode });
      await foundation.initialize();
      if (opts.verbose) {
        log("foundation-ready", `mode=${opts.mode} status=${JSON.stringify(foundation.getSystemStatus())}`);
      }
    } catch (error) {
      log("foundation-error", String(error));
      return undefined;
    }
    return foundation;
  }

  async function assess(text: string, channel: Channel, source: string, dedupKey?: string): Promise<void> {
    if (!text) return;
    if (dedupKey && !remember(dedupKey)) return;

    const foundationInstance = await foundationReady();
    if (!foundationInstance) return;

    const sample = text.slice(0, opts.maxInputLength);
    let emotionalState: unknown = null;
    try {
      emotionalState = await foundationInstance.assessEmotionalState(sample, { source }, channel);
    } catch (error) {
      emotionalState = { error: "emotional-assessment-unavailable", detail: String(error) };
    }

    try {
      const interaction = await foundationInstance.processInteraction({
        timestamp: new Date(),
        interactionType: InteractionType.EMOTIONAL_ASSESSMENT,
        data: { text: sample, emotionalState, source },
        userId: opts.userId,
        sessionId: opts.sessionId,
        channel,
      });
      const gateUp = Boolean(interaction?.content?.gateUp);
      if (opts.verbose) {
        log("message-assessment", `channel=${channel} source=${source} success=${interaction?.success ?? false} gateUp=${gateUp}`);
      }
      if (gateUp) {
        log("gate-up", `channel=${channel} source=${source} — escalate to Joshua W. Dorsey, Sr.`);
      }
    } catch (error) {
      log("assessment-error", `channel=${channel} source=${source} ${String(error)}`);
    }
  }

  return {
    "chat.message": async (_input, output) => {
      try {
        const role = (output.message as unknown as { role?: string }).role ?? "user";
        const channel = role === "assistant" ? Channel.MODEL_OUTPUT : Channel.USER_INPUT;
        const text = extractText(output.parts as ReadonlyArray<{ type?: string; text?: unknown }>);
        const dedupKey = output.parts
          .map((part) => (part as { id?: string }).id)
          .filter(Boolean)
          .join("+");
        await assess(text, channel, `chat:${role}`, dedupKey);
      } catch (error) {
        log("hook-error", "chat.message", String(error));
      }
    },
    "tool.execute.after": async (input, output) => {
      if (!opts.enableToolAssessment) return;
      try {
        const text = String(output.output ?? "").slice(0, opts.maxInputLength);
        await assess(text, Channel.TOOL_RESULT, `tool:${input.tool}`, `tool:${input.callID}`);
      } catch (error) {
        log("hook-error", "tool.execute.after", String(error));
      }
    },
    dispose: async () => {
      if (opts.verbose) {
        log("dispose", "asfdk-deploy shutting down");
      }
    },
  };
}
