import { test } from "node:test";
import assert from "node:assert/strict";
import { toi } from "@neurolift-technologies/asfdk";
import {
  formatGovernanceVerdict,
  normalizeGovernanceMode,
  shouldSoftHaltGovernance,
  verifyGovernance,
} from "../src/authority/verify.ts";

const CHECKED_AT = "2026-06-26T00:00:00.000Z";

function validToi() {
  return {
    $toi: "1.0.0",
    $tier: "personal",
    identity: {
      author: "Verifier Test Principal",
    },
    privacy: {
      retention: "session-only",
    },
  };
}

function validOtoi() {
  return {
    $otoi: "1.0.0",
    identity: {
      author: "Verifier Test Charter",
    },
    agents: [
      {
        id: "asfdk-harness-test",
        role: "test agent",
      },
    ],
    enforcement: {
      mode: "enforced",
      on_conflict: "escalate",
      on_unsupported: "degrade",
      audit: true,
    },
    toi_sources: [
      {
        tier: "personal",
        inline: validToi(),
      },
    ],
  };
}

test("absent governance reports absent and invalid", async () => {
  const verdict = await verifyGovernance({ checkedAt: CHECKED_AT });

  assert.equal(verdict.status, "absent");
  assert.equal(verdict.kind, "unknown");
  assert.equal(verdict.valid, false);
  assert.equal(verdict.signed, false);
  assert.equal(verdict.checkedAt, CHECKED_AT);
  assert.match(verdict.warnings.join("\n"), /No TOI or OTOI/);
});

test("valid unsigned TOI reports valid-unsigned", async () => {
  const verdict = await verifyGovernance({
    toi: validToi(),
    source: "toi:test",
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "valid-unsigned");
  assert.equal(verdict.kind, "toi");
  assert.equal(verdict.valid, true);
  assert.equal(verdict.signed, false);
  assert.equal(verdict.source, "toi:test");
  assert.deepEqual(verdict.errors, []);
  assert.match(verdict.warnings.join("\n"), /TOI is unsigned/);
});

test("valid unsigned OTOI reports valid-unsigned", async () => {
  const verdict = await verifyGovernance({
    otoi: JSON.stringify(validOtoi()),
    source: "otoi:test",
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "valid-unsigned");
  assert.equal(verdict.kind, "otoi");
  assert.equal(verdict.valid, true);
  assert.equal(verdict.signed, false);
  assert.deepEqual(verdict.errors, []);
  assert.match(verdict.warnings.join("\n"), /OTOI signature verification is not supported/);
});

test("valid TOI and OTOI bundle reports valid-unsigned", async () => {
  const verdict = await verifyGovernance({
    toi: validToi(),
    otoi: validOtoi(),
    source: "governance:test",
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "valid-unsigned");
  assert.equal(verdict.kind, "bundle");
  assert.equal(verdict.valid, true);
  assert.equal(verdict.signed, false);
  assert.deepEqual(verdict.errors, []);
});

test("signed TOI with valid signature reports verified", async () => {
  const keyPair = toi.generateKeyPair();
  const signedToi = toi.signToi(toi.parseToi(validToi()), keyPair.privateKey);
  const verdict = await verifyGovernance({
    toi: signedToi,
    source: "toi:signed",
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "verified");
  assert.equal(verdict.kind, "toi");
  assert.equal(verdict.valid, true);
  assert.equal(verdict.signed, true);
  assert.deepEqual(verdict.errors, []);
});

test("signed TOI with failed signature reports invalid", async () => {
  const keyPair = toi.generateKeyPair();
  const signedToi = toi.signToi(toi.parseToi(validToi()), keyPair.privateKey);
  const tamperedToi = {
    ...signedToi,
    identity: {
      ...signedToi.identity,
      author: "Tampered Principal",
    },
  };

  const verdict = await verifyGovernance({
    toi: tamperedToi,
    source: "toi:tampered",
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "invalid");
  assert.equal(verdict.kind, "toi");
  assert.equal(verdict.valid, false);
  assert.equal(verdict.signed, true);
  assert.match(verdict.errors.join("\n"), /signature verification failed/);
});

test("malformed TOI reports invalid with errors", async () => {
  const verdict = await verifyGovernance({
    toi: { $toi: "1.0.0", $tier: "personal" },
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "invalid");
  assert.equal(verdict.kind, "toi");
  assert.equal(verdict.valid, false);
  assert.match(verdict.errors.join("\n"), /Invalid TOI/);
});

test("malformed OTOI reports invalid with errors", async () => {
  const verdict = await verifyGovernance({
    otoi: { $otoi: "1.0.0", enforcement: { mode: "definitely-not-valid" } },
    checkedAt: CHECKED_AT,
  });

  assert.equal(verdict.status, "invalid");
  assert.equal(verdict.kind, "otoi");
  assert.equal(verdict.valid, false);
  assert.match(verdict.errors.join("\n"), /Invalid OTOI/);
});

test("formatGovernanceVerdict includes status, source, errors, and warnings", async () => {
  const verdict = await verifyGovernance({
    toi: { $toi: "1.0.0", $tier: "personal" },
    source: "toi:bad",
    checkedAt: CHECKED_AT,
  });

  const formatted = formatGovernanceVerdict(verdict);
  assert.match(formatted, /status=invalid/);
  assert.match(formatted, /kind=toi/);
  assert.match(formatted, /source=toi:bad/);
  assert.match(formatted, /errors=Invalid TOI/);
});

test("mode helpers default to lenient and only halt invalid or strict absent", async () => {
  const absent = await verifyGovernance({ checkedAt: CHECKED_AT });
  const invalid = await verifyGovernance({
    toi: { $toi: "1.0.0", $tier: "personal" },
    checkedAt: CHECKED_AT,
  });
  const validUnsigned = await verifyGovernance({
    toi: validToi(),
    checkedAt: CHECKED_AT,
  });

  assert.equal(normalizeGovernanceMode(undefined), "lenient");
  assert.equal(normalizeGovernanceMode("strict"), "strict");
  assert.equal(normalizeGovernanceMode("unexpected"), "lenient");
  assert.equal(shouldSoftHaltGovernance(absent, "lenient"), false);
  assert.equal(shouldSoftHaltGovernance(absent, "strict"), true);
  assert.equal(shouldSoftHaltGovernance(invalid, "lenient"), true);
  assert.equal(shouldSoftHaltGovernance(validUnsigned, "strict"), false);
});
