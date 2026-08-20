import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pluginDir = resolve(import.meta.dirname, "../openclaw-plugin");

describe("openclaw-plugin", () => {
  it("package.json has correct metadata", () => {
    const pkg = JSON.parse(readFileSync(resolve(pluginDir, "package.json"), "utf8"));
    assert.equal(pkg.name, "@neurolift-technologies/asfdk-deploy");
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.type, "module");
    assert.ok(pkg.peerDependencies?.openclaw);
    assert.equal(pkg.dependencies?.["@neurolift-technologies/asfdk"], "~0.2.4");
  });

  it("openclaw.plugin.json has valid config schema", () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginDir, "openclaw.plugin.json"), "utf8"));
    assert.equal(manifest.id, "asfdk-deploy");
    assert.ok(manifest.name.includes("Monitor-Only"));
    assert.equal(manifest.configSchema?.properties?.maxAssessLength?.type, "number");
    assert.equal(manifest.configSchema?.properties?.enforcement, undefined);
  });

  it("plugin description says monitor-only", () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginDir, "openclaw.plugin.json"), "utf8"));
    assert.ok(manifest.description.toLowerCase().includes("monitor-only"));
    assert.ok(manifest.description.toLowerCase().includes("does not block"));
  });

  it("index.ts has no enforcement mode", () => {
    const source = readFileSync(resolve(pluginDir, "index.ts"), "utf8");
    assert.ok(!source.includes("config.enforcement"), "should not have enforcement config");
    assert.ok(source.includes("MONITOR-ONLY"), "should declare monitor-only mode");
    assert.ok(!source.includes("BLOCKED reply"), "should not log BLOCKED reply");
  });

  it("index.ts requires real identity", () => {
    const source = readFileSync(resolve(pluginDir, "index.ts"), "utf8");
    assert.ok(source.includes("skipping") && source.includes("identity"), "should skip events without full identity");
    assert.ok(!source.includes('"openclaw-user"'), "should not hardcode openclaw-user");
    assert.ok(!source.includes('"openclaw-session"'), "should not hardcode openclaw-session");
  });

  it("index.ts has serialized foundation init", () => {
    const source = readFileSync(resolve(pluginDir, "index.ts"), "utf8");
    assert.ok(source.includes("initPromise"), "should use shared init promise");
  });

  it("index.ts handles component errors", () => {
    const source = readFileSync(resolve(pluginDir, "index.ts"), "utf8");
    assert.ok(source.includes("interaction.content?.error"), "should check for component errors");
    assert.ok(source.includes("component-error"), "should log component errors");
  });

  it("index.ts documents English-only scope", () => {
    const source = readFileSync(resolve(pluginDir, "index.ts"), "utf8");
    assert.ok(source.includes("ENGLISH-ONLY"), "should document English-only scope");
  });

  it("index.ts uses correct Channel labels for identity-bound hooks", () => {
    const source = readFileSync(resolve(pluginDir, "index.ts"), "utf8");
    // message_received (incoming peer message) must be assessed as USER_INPUT
    assert.ok(
      /message_received[\s\S]{0,500}Channel\.USER_INPUT/.test(source),
      "message_received should assess on Channel.USER_INPUT (incoming messages are user-origin)",
    );
    // before_tool_call (tool arguments) must be assessed on the tool-result channel
    assert.ok(
      /before_tool_call[\s\S]{0,500}Channel\.TOOL_RESULT/.test(source),
      "before_tool_call should assess on Channel.TOOL_RESULT (tool arguments)",
    );
    // No untyped `any` casts remain in the plugin source
    assert.ok(!source.includes("as any"), "plugin source should not use untyped `any` casts");
  });
});
