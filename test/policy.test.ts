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

test("blocks bash commands that read/exfiltrate sensitive paths (shell-bypass closed)", () => {
  // The shell bypass of the read/write/edit sensitive-path gate is now closed: bash commands
  // are tokenized and each token checked against the same SENSITIVE_PATH_PATTERNS.
  const blocked = [
    "cat .env",
    "cp .env /tmp/x",
    "cat ~/.ssh/id_rsa",
    "base64 id_ed25519",
    "grep SECRET .env.local",
    "cat config/credentials.json",
    // Quote/escape bypasses — bash strips these before execution (all read `.env`/`.ssh`):
    'cat .e""nv',
    "cat '.env'",
    "cat .e\\nv",
    "cat \\.env",
    "cat ~/.s''sh/id_rsa",
  ];
  for (const command of blocked) {
    const d = reviewToolCall("bash", { command });
    assert.equal(d.allow, false, `should block: ${command}`);
    assert.match(d.reason ?? "", /sensitive path/);
  }
  // Benign commands with no sensitive token still pass.
  assert.equal(reviewToolCall("bash", { command: "cat README.md" }).allow, true);
  assert.equal(reviewToolCall("bash", { command: "npm run build" }).allow, true);
});

test("documents the remaining coverage gap: dedicated search tools are not gated", () => {
  // `grep`/`ls`/`find` invoked as their own tools (not via bash) remain ungated by design —
  // pinned here so any future tightening is a deliberate change.
  assert.equal(reviewToolCall("grep", { pattern: "x", path: ".env" }).allow, true);
  assert.equal(reviewToolCall("ls", { path: "secrets" }).allow, true);
});

test("formatPolicyContext returns a JSON string with the payload", () => {
  const s = formatPolicyContext({ ok: true, note: "x" });
  assert.equal(typeof s, "string");
  assert.ok(s.includes('"ok":'), "must contain the payload key");
});

test("blocks recursive rm of root/home/glob targets regardless of flag order, split flags, long options, or `--`", () => {
  const blocked = [
    "rm -fr ~",
    "rm -fr /",
    "rm -rf -- /etc",
    "rm -fr -- ~",
    "rm -r -f /",
    "rm -R -f $HOME",
    "rm --recursive --force ~",
    "rm --force --recursive /var",
    "rm -r ~",
    "rm -rf ./build ~",
    "echo hi && rm -fr ~",
    "cd /tmp; rm -rf -- *",
    "rm -rf ${HOME}",
  ];
  for (const command of blocked) {
    const d = reviewToolCall("bash", { command });
    assert.equal(d.allow, false, `should block: ${command}`);
    assert.equal(d.severity, "block");
  }
});

test("still allows scoped rm and other rm-like commands", () => {
  const allowed = [
    "rm -rf ./build",
    "rm -rf node_modules",
    "rm -r ./tmp-dir",
    "rm -f file.txt",
    "rm file.txt",
    "git rm -r --cached ./dist",
    "rm -rf -- ./build",
    "echo rm -rf",
  ];
  for (const command of allowed) {
    assert.equal(reviewToolCall("bash", { command }).allow, true, `should allow: ${command}`);
  }
});

test("blocks shell globs that can expand to a sensitive file", () => {
  const blocked = [
    "cat .en?",
    "cat .e*",
    "cat .env*",
    "cat .e[n]v",
    "cp .en? /tmp/x",
    "cat id_*",
    "cat cred*",
    "cat sec*",
    "cat ~/.ssh/id_*",
  ];
  for (const command of blocked) {
    const d = reviewToolCall("bash", { command });
    assert.equal(d.allow, false, `should block: ${command}`);
    assert.equal(d.severity, "block");
  }
});

test("does not block broad or unrelated globs (they have no literal prefix that can name a sensitive file)", () => {
  // Known limit: a glob with fewer than two literal characters before the first wildcard (`*`, `.*`, `?env`)
  // is not inspected, so this guardrail does not stop `cat .*`. This is a guardrail, not a security boundary.
  const allowed = ["ls *.json", "cat *.md", "git add *", "ls -d .*", "cat src/**/*.ts", "[ -f x ]", "ls .git*", "cat [ab]*.txt"];
  for (const command of allowed) {
    assert.equal(reviewToolCall("bash", { command }).allow, true, `should allow: ${command}`);
  }
});
