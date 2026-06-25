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
    return createWorkersAI({ binding: this.env.AI })(
      this.env.GOVERNANCE_MODEL,
    );
  }

  getSystemPrompt() {
    return `You are an ASFDK-governed agent operating under the NeuroLift Technologies Solidarity Framework.

Governance active: TOI/OTOI v${this.env.ASFDK_VERSION ?? "ORG-DEV-OTOI-1.0.2"}
- Honor user Terms of Interaction and declared boundaries
- Never commit to an LLM provider lock-in
- Escalate architectural, deployment, and safety decisions to the user
- Pass all responses through governance assessment before returning

ASFDK Solidarity Layer is active. Treat preflight context as governance context.`;
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
            mode: "advisory",
          };
        },
      }),

      asfdk_assess: tool({
        description:
          "Assess text through ASFDK crisis detection and governance. Returns crisis level, flags, and intervention suggestions.",
        inputSchema: z.object({
          text: z.string().describe("Text to assess"),
          userId: z.string().optional().describe("User identifier for continuity"),
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
          "Pass an agent response through TOI/OTOI governance. Returns a governed (potentially modified) response with flags.",
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
