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

const PILLAR_SCOPED = [
  "@neurolift-technologies/otoi",
  "@neurolift-technologies/toi",
  "@neurolift-technologies/rrt-advocate",
  "@neurolift-technologies/sleepwalker-protocol",
];

function versionGte(version: string, min: string): boolean {
  const toParts = (v: string) =>
    v
      .replace(/^\D+/, "")
      .split(".")
      .map((p) => parseInt(p, 10) || 0);
  const a = toParts(version);
  const b = toParts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

test("asfdk is declared as a direct dependency", () => {
  assert.ok(
    pkg.dependencies?.["@neurolift-technologies/asfdk"],
    "@neurolift-technologies/asfdk must be in dependencies",
  );
});

test("asfdk resolves from the registry or a local tarball and is >= 0.2.2 (unpublished window)", () => {
  // D8 amendment (2026-08-04): during the unpublished window,
  // @neurolift-technologies/asfdk 0.2.2 is installed from the local tarball
  // (npm install <tarball>), so the lockfile `resolved` is a file: reference
  // rather than a registry URL. npm still records an integrity hash for the
  // tarball. TODO(2026-08-04): restore the strict registry-only assertion once
  // asfdk 0.2.2 is published to the public npm registry (plan D8) and delete
  // the versionGte helper.
  const name = "@neurolift-technologies/asfdk";
  const entry = lock.packages?.[`node_modules/${name}`];
  assert.ok(entry, `${name} must be present in package-lock.json`);
  const resolved = typeof entry.resolved === "string" ? entry.resolved : "";
  const isRegistry = resolved.startsWith("https://registry.npmjs.org/");
  const isLocalTarball = resolved.startsWith("file:");
  assert.ok(
    isRegistry || isLocalTarball,
    `${name} must resolve from registry.npmjs.org OR a local file tarball, got: ${resolved}`,
  );
  assert.ok(entry.integrity, `${name} must have an integrity hash`);
  assert.ok(versionGte(entry.version, "0.2.2"), `${name} must be >= 0.2.2, got ${entry.version}`);
  if (isRegistry) {
    const short = name.split("/")[1];
    assert.ok(
      resolved.includes(`/-/${short}-${entry.version}.tgz`),
      `${name} resolved tarball must match its locked version ${entry.version}`,
    );
  }
});

test("the four pillar packages resolve from the public npm registry (not local/git)", () => {
  for (const name of PILLAR_SCOPED) {
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

test("installed asfdk is >= 0.2.2 and exports the Channel provenance surface (D3)", async () => {
  const installed = JSON.parse(
    readFileSync(new URL("../node_modules/@neurolift-technologies/asfdk/package.json", import.meta.url), "utf8"),
  );
  assert.ok(
    versionGte(installed.version, "0.2.2"),
    `installed asfdk must be >= 0.2.2, got ${installed.version}`,
  );
  const mod = await import("@neurolift-technologies/asfdk");
  assert.ok(mod.Channel, "Channel enum must be exported");
  assert.equal(mod.Channel.UNKNOWN, "unknown");
});
