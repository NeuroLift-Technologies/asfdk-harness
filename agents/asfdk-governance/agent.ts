import {
  Think,
  type Session,
  type TurnContext,
  type TurnConfig,
  type ChatResponseResult,
} from "@cloudflare/think";
import { createWorkersAI } from "workers-ai-provider";
import { tool, type TextUIPart, type ToolSet } from "ai";
import { z } from "zod";
import {
  formatGovernanceVerdict,
  normalizeGovernanceMode,
  shouldSoftHaltGovernance,
  verifyGovernance,
  type GovernanceMode,
  type GovernanceVerdict,
  type GovernanceVerifyInput,
} from "../../src/authority/verify.js";
import { assessCrisis } from "../../src/governance/crisis.js";
import { governInteraction } from "../../src/governance/otoi.js";
import { handleContinuity } from "../../src/governance/continuity.js";

interface Env extends Cloudflare.Env {}

export class AsfdkGovernanceAgent extends Think<Env> {
  /**
   * Per-room Durable Object instance name provided by the Agents framework.
   * Used as the server-side user identity for crisis assessment and
   * continuity so users never share a single KV record. Never fall back to
   * the version constant — that would collapse all users into one record.
   */
  private getIdentity(): string {
    return this.name && this.name.length > 0
      ? this.name
      : "unidentified-session";
  }

  getModel() {
    return createWorkersAI({ binding: this.env.AI })(this.env.GOVERNANCE_MODEL);
  }

  getSystemPrompt() {
    return `You are an ASFDK-governed agent operating under the NeuroLift Technologies Solidarity Framework.

Governance active: TOI/OTOI v${this.env.ASFDK_VERSION ?? "ORG-DEV-OTOI-1.0.2"}
Governance verification mode: ${this.governanceMode()}
- Honor user Terms of Interaction and declared boundaries
- Never commit to an LLM provider lock-in
- Escalate architectural, deployment, and safety decisions to the user
- Pass all responses through governance assessment before returning

ASFDK Solidarity Layer is active. Treat preflight context as governance context.`;
  }

  private governanceMode(): GovernanceMode {
    return normalizeGovernanceMode(this.env.ASFDK_GOVERNANCE_MODE);
  }

  configureSession(session: Session): Session {
    return session
      .withContext("toi-otoi", {
        description:
          "Active TOI/OTOI governance rules, user preferences, and optimization data. The model can read and update these via set_context.",
        maxTokens: 2000,
      })
      .withContext("continuity", {
        description:
          "Cross-session emotional state, declared boundaries, and protective state from Sleepwalker continuity. Persists across sessions.",
        maxTokens: 1000,
      })
      .withCachedPrompt();
  }

  async beforeTurn(ctx: TurnContext): Promise<TurnConfig | void> {
    const lastUserMessage = ctx.messages
      .filter((m) => m.role === "user")
      .at(-1);

    if (!lastUserMessage) {
      return;
    }

    // Extract text from string OR multimodal content-part array so crisis/continuity
    // checks are not silently bypassed (fail-open) on rich-content messages.
    const rawContent = lastUserMessage.content as unknown;
    let userText = "";
    if (typeof rawContent === "string") {
      userText = rawContent;
    } else if (Array.isArray(rawContent)) {
      userText = (rawContent as Array<{ type?: string; text?: string }>)
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("");
    }

    if (!userText) {
      return;
    }

    const governanceInput = await loadGovernanceContracts(
      this.env.GOVERNANCE,
      this.getIdentity(),
    );
    const governanceVerdict = verifyGovernance(governanceInput);
    const mode = this.governanceMode();
    const governanceSummary = formatGovernanceVerdict(governanceVerdict);

    if (shouldSoftHaltGovernance(governanceVerdict, mode)) {
      return governanceSoftHalt(ctx, governanceVerdict, mode);
    }

    const assessment = await assessCrisis(
      {
        userId: this.getIdentity(),
        message: userText,
      },
      this.env.AI,
      this.env.GOVERNANCE_MODEL,
    );

    const continuity = await handleContinuity(
      { userId: this.getIdentity(), action: "load" },
      this.env.SESSION,
    );

    const preflightBlocks: string[] = [];
    preflightBlocks.push(`[ASFDK Authority] ${governanceSummary}`);
    if (assessment.level !== "GREEN") {
      preflightBlocks.push(
        `[RRT Advocate] Crisis level: ${assessment.level}${assessment.intervention ? ` — suggested response: ${assessment.intervention}` : ""}`,
      );
    }
    if (continuity.context) {
      preflightBlocks.push(
        `[Sleepwalker Continuity] ${JSON.stringify(continuity.context)}`,
      );
    }

    if (preflightBlocks.length > 0) {
      return {
        system: `${ctx.system}\n\nASFDK Preflight:\n${preflightBlocks.join("\n")}`,
      };
    }
  }

  getTools(): ToolSet {
    // Code-execution tools intentionally removed — re-add only behind auth + a worker_loaders binding if ever needed.
    return {
      asfdk_status: tool({
        description: "Return ASFDK governance status and component health.",
        inputSchema: z.object({}),
        execute: async () => {
          return {
            version: this.env.ASFDK_VERSION,
            model: this.env.GOVERNANCE_MODEL,
            governance: "TOI-OTOI + RRT Advocate + Sleepwalker Continuity",
            governanceMode: this.governanceMode(),
            mode: "advisory",
          };
        },
      }),

      asfdk_assess: tool({
        description:
          "Assess text through ASFDK crisis detection and governance. Returns crisis level, flags, and intervention suggestions.",
        inputSchema: z.object({
          text: z.string().describe("Text to assess"),
          userId: z
            .string()
            .optional()
            .describe("User identifier for continuity"),
        }),
        execute: async ({ text, userId }) => {
          const assessment = await assessCrisis(
            { userId: userId ?? "anonymous", message: text },
            this.env.AI,
            this.env.GOVERNANCE_MODEL,
          );
          return assessment;
        },
      }),

      asfdk_govern: tool({
        description:
          "Pass an agent response through advisory TOI/OTOI compliance review. Deterministic authority verification runs separately before this LLM review path.",
        inputSchema: z.object({
          message: z.string().describe("Original user message"),
          agentResponse: z.string().describe("Agent response to govern"),
          userId: z.string().optional(),
        }),
        execute: async ({ message, agentResponse, userId }) => {
          const governed = await governInteraction(
            {
              userId: userId ?? "anonymous",
              message,
              agentResponse,
            },
            this.env.AI,
            this.env.GOVERNANCE_MODEL,
          );
          return governed;
        },
      }),

      asfdk_continuity: tool({
        description:
          "Load or save cross-session continuity context (emotional state, boundaries).",
        inputSchema: z.object({
          action: z.enum(["load", "save"]),
          sessionData: z.any().optional(),
        }),
        execute: async ({ action, sessionData }) => {
          // Bind continuity to the server-side identity so a caller cannot
          // read or write another user's record (IDOR).
          return handleContinuity(
            { userId: this.getIdentity(), action, sessionData },
            this.env.SESSION,
          );
        },
      }),
    };
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    const textParts = result.message.parts.filter(
      (p): p is TextUIPart => p.type === "text",
    );
    const text = textParts.map((p) => p.text).join("");

    if (text) {
      try {
        await handleContinuity(
          {
            userId: this.getIdentity(),
            action: "save",
            sessionData: {
              lastResponse: text,
              ts: Date.now(),
            },
          },
          this.env.SESSION,
        );
      } catch (error) {
        console.error("Failed to save continuity context:", error);
      }
    }
  }
}

async function loadGovernanceContracts(
  kv: KVNamespace,
  identity: string,
): Promise<GovernanceVerifyInput> {
  const bundleKeys = [`governance:${identity}`, "governance:org"];
  for (const key of bundleKeys) {
    const raw = await kv.get(key);
    if (raw !== null) return contractInputFromBundle(raw, key);
  }

  const toi = await getFirstKvValue(kv, [`toi:${identity}`, "toi:org"]);
  const otoi = await getFirstKvValue(kv, [`otoi:${identity}`, "otoi:org"]);
  return {
    toi: toi?.value,
    otoi: otoi?.value,
    source:
      [toi?.key, otoi?.key]
        .filter((key): key is string => Boolean(key))
        .join(", ") || undefined,
  };
}

async function getFirstKvValue(
  kv: KVNamespace,
  keys: string[],
): Promise<{ key: string; value: string } | undefined> {
  for (const key of keys) {
    const value = await kv.get(key);
    if (value !== null) return { key, value };
  }
  return undefined;
}

function contractInputFromBundle(
  raw: string,
  source: string,
): GovernanceVerifyInput {
  const parsed = tryParseJson(raw);
  if (isRecord(parsed) && ("toi" in parsed || "otoi" in parsed)) {
    return {
      toi: parsed.toi,
      otoi: parsed.otoi,
      source: stringValue(parsed.source) ?? source,
    };
  }

  if (isRecord(parsed) && "$otoi" in parsed) {
    return {
      otoi: parsed,
      source,
    };
  }

  return {
    toi: parsed,
    source,
  };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function governanceSoftHalt(
  ctx: TurnContext,
  verdict: GovernanceVerdict,
  mode: GovernanceMode,
): TurnConfig {
  const reason = formatGovernanceVerdict(verdict);
  return {
    system: `${ctx.system}

ASFDK Authority HALT:
${reason}
Governance mode: ${mode}

Stop the turn. Do not perform tool calls, crisis assessment, continuity access, or task work. Reply only with a concise refusal that says deterministic TOI/OTOI verification failed or is absent under strict mode. This is a soft prompt-level halt because the installed Think beforeTurn API does not expose a fixed-response abort field.`,
    activeTools: [],
    maxSteps: 1,
    maxOutputTokens: 160,
    sendReasoning: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
