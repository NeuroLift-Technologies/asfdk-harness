export interface ToolPolicyDecision {
  allow: boolean;
  reason?: string;
  severity: "allow" | "advise" | "block";
}

const DESTRUCTIVE_SHELL_PATTERNS = [
  /\brm\s+-rf\s+(?:\/|~|\$HOME|\*)/i,
  /\bsudo\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
];

const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i,
  /(^|\/)credentials(?:\.|$)/i,
  /(^|\/)secrets?(?:\.|\/|$)/i,
];

export function reviewToolCall(toolName: string, input: Record<string, unknown>): ToolPolicyDecision {
  if (toolName === "bash") {
    const command = String(input.command ?? "");
    const matched = DESTRUCTIVE_SHELL_PATTERNS.find((pattern) => pattern.test(command));
    if (matched) {
      return {
        allow: false,
        severity: "block",
        reason: `ASFDK harness blocked high-risk shell command pattern: ${matched}`,
      };
    }
  }

  if (["read", "write", "edit"].includes(toolName)) {
    const path = String(input.path ?? "");
    const matched = SENSITIVE_PATH_PATTERNS.find((pattern) => pattern.test(path));
    if (matched) {
      return {
        allow: false,
        severity: "block",
        reason: `ASFDK harness blocked access to sensitive path pattern: ${matched}`,
      };
    }
  }

  return { allow: true, severity: "allow" };
}

export function formatPolicyContext(assessment: unknown): string {
  return [
    "ASFDK preflight completed for this turn.",
    "Treat this as governance context, not as user-visible diagnosis.",
    "Assessment payload:",
    JSON.stringify(assessment, null, 2),
  ].join("\n");
}
