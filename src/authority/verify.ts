import { loadAsfdk } from "../asfdk-runtime.js";

export type GovernanceVerdictStatus = "verified" | "valid-unsigned" | "invalid" | "absent";
export type GovernanceVerdictKind = "toi" | "otoi" | "bundle" | "unknown";
export type GovernanceMode = "lenient" | "strict";

export interface GovernanceVerifyInput {
  toi?: unknown;
  otoi?: unknown;
  source?: string;
  checkedAt?: string;
}

export interface GovernanceVerdict {
  status: GovernanceVerdictStatus;
  kind: GovernanceVerdictKind;
  valid: boolean;
  signed: boolean;
  errors: string[];
  warnings: string[];
  source?: string;
  checkedAt: string;
}

interface ContractCheck {
  present: boolean;
  valid: boolean;
  signed: boolean;
  verified: boolean;
  errors: string[];
  warnings: string[];
}

export function isGovernanceAbsent(input: GovernanceVerifyInput): boolean {
  return (
    (input.toi === undefined || input.toi === null) &&
    (input.otoi === undefined || input.otoi === null)
  );
}

export async function verifyGovernance(input: GovernanceVerifyInput): Promise<GovernanceVerdict> {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const source = input.source;

  if (isGovernanceAbsent(input)) {
    return {
      status: "absent",
      kind: "unknown",
      valid: false,
      signed: false,
      errors: [],
      warnings: ["No TOI or OTOI governance contract was supplied."],
      source,
      checkedAt,
    };
  }

  const { otoi, toi } = await loadAsfdk();
  const toiCheck = checkToi(input.toi, toi);
  const otoiCheck = checkOtoi(input.otoi, otoi);
  const checks = [toiCheck, otoiCheck].filter((check) => check.present);
  const errors = checks.flatMap((check) => check.errors);
  const warnings = checks.flatMap((check) => check.warnings);
  const kind = resolveKind(toiCheck.present, otoiCheck.present);
  const signed = checks.some((check) => check.signed);

  if (errors.length > 0 || checks.some((check) => !check.valid)) {
    return {
      status: "invalid",
      kind,
      valid: false,
      signed,
      errors,
      warnings,
      source,
      checkedAt,
    };
  }

  const allVerified = checks.length > 0 && checks.every((check) => check.verified);
  return {
    status: allVerified ? "verified" : "valid-unsigned",
    kind,
    valid: true,
    signed,
    errors: [],
    warnings: allVerified ? warnings : [...warnings, "Governance contract is structurally valid but not cryptographically verified."],
    source,
    checkedAt,
  };
}

export function formatGovernanceVerdict(verdict: GovernanceVerdict): string {
  const parts = [
    `status=${verdict.status}`,
    `kind=${verdict.kind}`,
    `valid=${String(verdict.valid)}`,
    `signed=${String(verdict.signed)}`,
  ];
  if (verdict.source) parts.push(`source=${verdict.source}`);
  if (verdict.errors.length > 0) parts.push(`errors=${verdict.errors.join("; ")}`);
  if (verdict.warnings.length > 0) parts.push(`warnings=${verdict.warnings.join("; ")}`);
  return `Governance verdict: ${parts.join(", ")}`;
}

export function normalizeGovernanceMode(mode: string | undefined): GovernanceMode {
  return mode === "strict" ? "strict" : "lenient";
}

export function shouldSoftHaltGovernance(verdict: GovernanceVerdict, mode: GovernanceMode): boolean {
  return verdict.status === "invalid" || (verdict.status === "absent" && mode === "strict");
}

function checkToi(candidate: unknown, toi: any): ContractCheck {
  if (candidate === undefined || candidate === null) return absentCheck();

  try {
    const parsed = toi.safeParseToi(candidate);
    if (!parsed.success) {
      return {
        present: true,
        valid: false,
        signed: false,
        verified: false,
        errors: [`Invalid TOI: ${formatError(parsed.error)}`],
        warnings: [],
      };
    }

    const signed = toi.isSigned(parsed.data);
    if (!signed) {
      return {
        present: true,
        valid: true,
        signed: false,
        verified: false,
        errors: [],
        warnings: ["TOI is unsigned."],
      };
    }

    const verified = toi.verifyToi(parsed.data);
    return {
      present: true,
      valid: verified,
      signed: true,
      verified,
      errors: verified ? [] : ["Invalid TOI: signature verification failed."],
      warnings: [],
    };
  } catch (error) {
    return {
      present: true,
      valid: false,
      signed: false,
      verified: false,
      errors: [`Invalid TOI: ${formatError(error)}`],
      warnings: [],
    };
  }
}

function checkOtoi(candidate: unknown, otoi: any): ContractCheck {
  if (candidate === undefined || candidate === null) return absentCheck();

  try {
    otoi.parseCharter(candidate);
  } catch (error) {
    return {
      present: true,
      valid: false,
      signed: false,
      verified: false,
      errors: [`Invalid OTOI: ${formatError(error)}`],
      warnings: [],
    };
  }

  return {
    present: true,
    valid: true,
    signed: false,
    verified: false,
    errors: [],
    warnings: ["OTOI signature verification is not supported by the current ASFDK package API."],
  };
}

function absentCheck(): ContractCheck {
  return {
    present: false,
    valid: false,
    signed: false,
    verified: false,
    errors: [],
    warnings: [],
  };
}

function resolveKind(hasToi: boolean, hasOtoi: boolean): GovernanceVerdictKind {
  if (hasToi && hasOtoi) return "bundle";
  if (hasToi) return "toi";
  if (hasOtoi) return "otoi";
  return "unknown";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
