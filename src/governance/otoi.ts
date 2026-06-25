import type { GovernRequest, GovernResponse } from "./types.js";

const GOVERNANCE_SYSTEM_PROMPT = `You are the NLT-OTOI component of the ASFDK Solidarity Framework.

Your role is to ensure agent responses comply with the user's Terms of Interaction (TOI).
Review the agent response and apply governance rules:
- Privacy: no data leakage, no storing sensitive info without consent
- Tone: match the user's declared preferences (default: professional, clear)
- Boundaries: respect any user-declared topic restrictions
- Transparency: flag if the response is evasive or unclear

Respond with ONLY a JSON object:
{
  "governedResponse": "the (potentially modified) response text",
  "flags": ["list of governance flags triggered, empty array if none"],
  "modified": true | false
}`;

export async function governInteraction(
  req: GovernRequest,
  ai: Ai,
  modelName: string,
): Promise<GovernResponse> {
  const toiContext = req.toi
    ? `\nUser TOI preferences: ${JSON.stringify(req.toi)}`
    : "";

  const result = await ai.run(    modelName as keyof AiModels, {
    messages: [
      { role: "system" as const, content: GOVERNANCE_SYSTEM_PROMPT + toiContext },
      {
        role: "user" as const,
        content: `User message: ${req.message}\n\nAgent response to govern: ${req.agentResponse}`,
      },
    ],
  });

  try {
    const text = (result as { response?: string }).response ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as GovernResponse;
    return {
      governedResponse: parsed.governedResponse ?? req.agentResponse,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      modified: parsed.modified ?? false,
    };
  } catch {
    return { governedResponse: req.agentResponse, flags: [], modified: false };
  }
}
