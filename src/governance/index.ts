import { assessCrisis } from "./crisis.js";
import { handleContinuity } from "./continuity.js";
import { governInteraction } from "./otoi.js";
import type {
  AssessRequest,
  AssessResponse,
  ContinuityRequest,
  ContinuityResponse,
  GovernRequest,
  GovernResponse,
  GovernanceEnv,
  ProcessRequest,
  ProcessResponse,
} from "./types.js";

export async function assessTurn(
  req: AssessRequest,
  env: GovernanceEnv,
): Promise<AssessResponse> {
  return assessCrisis(req, env.AI, env.GOVERNANCE_MODEL);
}

export async function governTurn(
  req: GovernRequest,
  env: GovernanceEnv,
): Promise<GovernResponse> {
  return governInteraction(req, env.AI, env.GOVERNANCE_MODEL);
}

export async function saveContinuity(
  req: ContinuityRequest,
  kv: KVNamespace,
): Promise<ContinuityResponse> {
  return handleContinuity(req, kv);
}

export async function processPipeline(
  req: ProcessRequest,
  env: GovernanceEnv,
): Promise<ProcessResponse> {
  const assessment = await assessCrisis(
    { userId: req.userId, message: req.message },
    env.AI,
    env.GOVERNANCE_MODEL,
  );

  if (assessment.level === "BLACK") {
    return {
      assessment,
      governed: { governedResponse: req.agentResponse, flags: [], modified: false },
      finalResponse: assessment.intervention ?? "Crisis intervention required.",
    };
  }

  const governed = await governInteraction(
    { userId: req.userId, message: req.message, agentResponse: req.agentResponse },
    env.AI,
    env.GOVERNANCE_MODEL,
  );

  await handleContinuity(
    {
      userId: req.userId,
      action: "save",
      sessionData: { lastMessage: req.message, lastLevel: assessment.level, ts: Date.now() },
    },
    env.SESSION,
  );

  return {
    assessment,
    governed,
    finalResponse: governed.governedResponse,
  };
}

export type {
  AssessRequest,
  AssessResponse,
  CrisisLevel,
  GovernRequest,
  GovernResponse,
  GovernanceEnv,
  ContinuityRequest,
  ContinuityResponse,
  ProcessRequest,
  ProcessResponse,
} from "./types.js";
