import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewToolCall, formatPolicyContext } from "../src/policy.ts";

test("blocks obviously destructive shell commands", () => {
  const destructive = [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf $HOME",
    "rm -rf *",
    "sudo rm something",
    "dd if=/dev/zero of=/dev/sda",
    "mkfs.ext4 /dev/sda1",
    "shutdown now",
    "reboot",
    "chmod -R 777 .",
  ];
  for (const command of destructive) {
    const d = reviewToolCall("bash", { command });
    assert.equal(d.allow, false, `should block: ${command}`);
    assert.equal(d.severity, "block");
    assert.match(d.reason ?? "", /ASFDK harness blocked/);
  }
});

test("allows ordinary shell commands (conservative posture)", () => {
  // Note: `rm -rf ./build` is intentionally allowed — the pattern only blocks
  // root-ish / glob / $HOME targets, not scoped relative deletes.
  const ordinary = ["npm run build", "ls -la", "git status", "rm -rf ./build", "echo hi"];
  for (const command of ordinary) {
    const d = reviewToolCall("bash", { command });
    assert.equal(d.allow, true, `should allow: ${command}`);
    assert.equal(d.severity, "allow");
  }
});

test("blocks read/write/edit of sensitive paths", () => {
  const cases: Array<[string, string]> = [
    ["read", ".env"],
    ["read", "/home/u/.ssh/id_rsa"],
    ["read", "x/id_ed25519"],
    ["write", "config/credentials.json"],
    ["edit", "secrets/key.pem"],
    ["read", "app/.env.production"],
  ];
  for (const [tool, path] of cases) {
    const d = reviewToolCall(tool, { path });
    assert.equal(d.allow, false, `should block ${tool} ${path}`);
    assert.equal(d.severity, "block");
  }
});

test("allows non-sensitive file paths", () => {
  const cases: Array<[string, string]> = [
    ["read", "README.md"],
    ["write", "src/index.ts"],
    ["edit", "docs/notes.md"],
  ];
  for (const [tool, path] of cases) {
    assert.equal(reviewToolCall(tool, { path }).allow, true, `${tool} ${path}`);
  }
});

test("documents the current coverage gap: non-file/non-bash tools are not gated", () => {
  // `grep`/`ls`/`find` can surface sensitive content but are not currently gated, and
  // `bash` is only checked for destructive patterns (not for reading sensitive paths).
  // These assertions pin the *current* behavior so a future tightening is a deliberate change.
  assert.equal(reviewToolCall("grep", { pattern: "x", path: ".env" }).allow, true);
  assert.equal(reviewToolCall("ls", { path: "secrets" }).allow, true);
  assert.equal(reviewToolCall("bash", { command: "cat .env" }).allow, true);
});

test("formatPolicyContext returns a governance-context string with the payload", () => {
  const s = formatPolicyContext({ ok: true, note: "x" });
  assert.equal(typeof s, "string");
  assert.match(s, /ASFDK preflight/);
  assert.match(s, /governance context/i);
  assert.ok(s.includes('"ok": true'));
});
