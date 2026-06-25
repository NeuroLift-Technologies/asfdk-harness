import { Think, } from "@cloudflare/think";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createWorkersAI } from "workers-ai-provider";
import { tool } from "ai";
import { z } from "zod";
import { assessCrisis } from "../../src/governance/crisis.js";
import { governInteraction } from "../../src/governance/otoi.js";
import { handleContinuity } from "../../src/governance/continuity.js";
export class AsfdkGovernanceAgent extends Think {
    getModel() {
        return createWorkersAI({ binding: this.env.AI })(this.env.GOVERNANCE_MODEL);
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
    configureSession(session) {
        return session
            .withContext("toi-otoi", {
            description: "Active TOI/OTOI governance rules, user preferences, and optimization data. The model can read and update these via set_context.",
            maxTokens: 2000,
        })
            .withContext("continuity", {
            description: "Cross-session emotional state, declared boundaries, and protective state from Sleepwalker continuity. Persists across sessions.",
            maxTokens: 1000,
        })
            .withCachedPrompt();
    }
    async beforeTurn(ctx) {
        const lastUserMessage = ctx.messages
            .filter((m) => m.role === "user")
            .at(-1);
        if (!lastUserMessage || typeof lastUserMessage.content !== "string") {
            return;
        }
        const assessment = await assessCrisis({
            userId: this.env.ASFDK_VERSION,
            message: lastUserMessage.content,
        }, this.env.AI, this.env.GOVERNANCE_MODEL);
        const continuity = await handleContinuity({ userId: this.env.ASFDK_VERSION, action: "load" }, this.env.SESSION);
        const preflightBlocks = [];
        if (assessment.level !== "GREEN") {
            preflightBlocks.push(`[RRT Advocate] Crisis level: ${assessment.level}${assessment.intervention ? ` — suggested response: ${assessment.intervention}` : ""}`);
        }
        if (continuity.context) {
            preflightBlocks.push(`[Sleepwalker Continuity] ${JSON.stringify(continuity.context)}`);
        }
        if (preflightBlocks.length > 0) {
            return {
                system: `${ctx.system}\n\nASFDK Preflight:\n${preflightBlocks.join("\n")}`,
            };
        }
    }
    getTools() {
        const workspaceTools = createWorkspaceTools(this.workspace);
        const executeTool = createExecuteTool(this);
        return {
            execute: executeTool,
            ...workspaceTools,
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
                description: "Assess text through ASFDK crisis detection and governance. Returns crisis level, flags, and intervention suggestions.",
                inputSchema: z.object({
                    text: z.string().describe("Text to assess"),
                    userId: z.string().optional().describe("User identifier for continuity"),
                }),
                execute: async ({ text, userId }) => {
                    const assessment = await assessCrisis({ userId: userId ?? "anonymous", message: text }, this.env.AI, this.env.GOVERNANCE_MODEL);
                    return assessment;
                },
            }),
            asfdk_govern: tool({
                description: "Pass an agent response through TOI/OTOI governance. Returns a governed (potentially modified) response with flags.",
                inputSchema: z.object({
                    message: z.string().describe("Original user message"),
                    agentResponse: z.string().describe("Agent response to govern"),
                    userId: z.string().optional(),
                }),
                execute: async ({ message, agentResponse, userId }) => {
                    const governed = await governInteraction({
                        userId: userId ?? "anonymous",
                        message,
                        agentResponse,
                    }, this.env.AI, this.env.GOVERNANCE_MODEL);
                    return governed;
                },
            }),
            asfdk_continuity: tool({
                description: "Load or save cross-session continuity context (emotional state, boundaries).",
                inputSchema: z.object({
                    action: z.enum(["load", "save"]),
                    userId: z.string(),
                    sessionData: z.any().optional(),
                }),
                execute: async ({ action, userId, sessionData }) => {
                    return handleContinuity({ userId, action, sessionData }, this.env.SESSION);
                },
            }),
        };
    }
    async onChatResponse(result) {
        const textParts = result.message.parts.filter((p) => p.type === "text");
        const text = textParts.map((p) => p.text).join("");
        if (text) {
            await handleContinuity({
                userId: this.env.ASFDK_VERSION,
                action: "save",
                sessionData: {
                    lastResponse: text,
                    ts: Date.now(),
                },
            }, this.env.SESSION);
        }
    }
}
//# sourceMappingURL=agent.js.map