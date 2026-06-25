export type CrisisLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "BLACK";

export interface AssessRequest {
  userId: string;
  message: string;
  sessionHistory?: Array<{ role: string; content: string }>;
}

export interface AssessResponse {
  level: CrisisLevel;
  intervention?: string;
  escalate: boolean;
}

export interface GovernRequest {
  userId: string;
  message: string;
  agentResponse: string;
  toi?: Record<string, unknown>;
}

export interface GovernResponse {
  governedResponse: string;
  flags: string[];
  modified: boolean;
}

export interface ContinuityRequest {
  userId: string;
  action: "load" | "save";
  sessionData?: Record<string, unknown>;
}

export interface ContinuityResponse {
  context?: Record<string, unknown>;
  saved?: boolean;
}

export interface ProcessRequest {
  userId: string;
  message: string;
  agentResponse: string;
}

export interface ProcessResponse {
  assessment: AssessResponse;
  governed: GovernResponse;
  finalResponse: string;
}

export interface GovernanceEnv {
  AI: Ai;
  SESSION: KVNamespace;
  DB: D1Database;
  GOVERNANCE_MODEL: string;
  ASFDK_VERSION: string;
}
