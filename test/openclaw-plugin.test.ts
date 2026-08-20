import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("openclaw-plugin", () => {
  const pluginDir = resolve(import.meta.dirname, "../openclaw-plugin");

  it("package.json has correct metadata", () => {
    const pkg = JSON.parse(readFileSync(resolve(pluginDir, "package.json"), "utf8"));
    expect(pkg.name).toBe("@neurolift-technologies/asfdk-deploy");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.type).toBe("module");
    expect(pkg.peerDependencies?.openclaw).toBeDefined();
    expect(pkg.dependencies?.["@neurolift-technologies/asfdk"]).toBe("~0.2.4");
  });

  it("openclaw.plugin.json has valid config schema", () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginDir, "openclaw.plugin.json"), "utf8"));
    expect(manifest.id).toBe("asfdk-deploy");
    expect(manifest.configSchema?.properties?.enforcement?.type).toBe("boolean");
    expect(manifest.configSchema?.properties?.maxAssessLength?.type).toBe("number");
  });

  it("index.ts exports a plugin entry", async () => {
    // Dynamic import — this verifies the module loads without throwing
    const mod = await import(resolve(pluginDir, "index.ts"));
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.register).toBe("function");
  });
});
