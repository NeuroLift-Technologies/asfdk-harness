import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Locks in the "asfdk is properly set and uses the published npm package" guarantee so it
// cannot silently regress (e.g. an agent swapping in a `file:`/`link:`/git dependency or a
// local symlinked checkout). Fully offline — only inspects package.json, package-lock.json,
// node_modules, and the resolved module.

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

const SCOPED = [
  "@neurolift-technologies/asfdk",
  "@neurolift-technologies/otoi",
  "@neurolift-technologies/toi",
  "@neurolift-technologies/rrt-advocate",
  "@neurolift-technologies/sleepwalker-protocol",
];

test("asfdk is declared as a direct dependency", () => {
  assert.ok(
    pkg.dependencies?.["@neurolift-technologies/asfdk"],
    "@neurolift-technologies/asfdk must be in dependencies",
  );
});

test("asfdk and all four pillars resolve from the public npm registry (not local/git)", () => {
  for (const name of SCOPED) {
    const entry = lock.packages?.[`node_modules/${name}`];
    assert.ok(entry, `${name} must be present in package-lock.json`);
    assert.ok(
      typeof entry.resolved === "string" && entry.resolved.startsWith("https://registry.npmjs.org/"),
      `${name} must resolve from registry.npmjs.org, got: ${entry.resolved}`,
    );
    assert.ok(entry.integrity, `${name} must have an integrity hash`);
    const short = name.split("/")[1];
    assert.ok(
      entry.resolved.includes(`/-/${short}-${entry.version}.tgz`),
      `${name} resolved tarball must match its locked version ${entry.version}`,
    );
  }
});

test("installed asfdk is a real npm install, not a symlink to a local checkout", () => {
  const dir = fileURLToPath(new URL("../node_modules/@neurolift-technologies/asfdk", import.meta.url));
  assert.equal(lstatSync(dir).isSymbolicLink(), false, "asfdk must not be a symlinked local repo");
});

test("the resolved npm package is the published tarball (dist only), not the source repo", () => {
  // The published tarball ships only its `files` allowlist; the local sibling repo would have src/.
  const installed = JSON.parse(
    readFileSync(new URL("../node_modules/@neurolift-technologies/asfdk/package.json", import.meta.url), "utf8"),
  );
  assert.equal(installed.name, "@neurolift-technologies/asfdk");
  assert.ok(installed.version, "installed asfdk must report a version");
  assert.equal(
    installed.version,
    lock.packages?.["node_modules/@neurolift-technologies/asfdk"]?.version,
    "installed asfdk version must match the lockfile",
  );
});

test("the asfdk package loads and exposes the foundation factory at runtime", async () => {
  const mod = await import("@neurolift-technologies/asfdk");
  assert.equal(typeof mod.createFoundation, "function");
  assert.ok(mod.FoundationMode, "FoundationMode must be exported");
  assert.ok(mod.InteractionType, "InteractionType must be exported");
});
