import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProtocolSnapshot, loadGovernanceProtocols } from "../src/protocols.ts";

const ROOT_OTOI = new URL("../.otoi", import.meta.url);
const ROOT_DEFAULT_TOI = new URL("../.toi.default", import.meta.url);

async function withGovernanceFixture(
  setup: (dir: string) => Promise<void>,
  run: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "asfdk-protocols-"));
  const previousToiPath = process.env.ASFDK_TOI_PATH;
  delete process.env.ASFDK_TOI_PATH;

  try {
    await writeFile(join(dir, ".otoi"), await readFile(ROOT_OTOI, "utf8"));
    await writeFile(join(dir, ".toi.default"), await readFile(ROOT_DEFAULT_TOI, "utf8"));
    await setup(dir);
    await run(dir);
  } finally {
    if (previousToiPath === undefined) {
      delete process.env.ASFDK_TOI_PATH;
    } else {
      process.env.ASFDK_TOI_PATH = previousToiPath;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("clean checkouts resolve the tracked default TOI through OTOI", async () => {
  await withGovernanceFixture(
    async () => {},
    async (dir) => {
      const context = await loadGovernanceProtocols({ cwd: dir });
      const snapshot = createProtocolSnapshot(context);

      assert.equal(context.toiPath, join(dir, ".toi.default"));
      assert.deepEqual(context.diagnostics, []);
      assert.ok(context.protocols.includes("local-toi-file"));
      assert.ok(context.protocols.includes("local-otoi-charter"));
      assert.ok(context.protocols.includes("otoi-honor-resolution"));
      assert.strictEqual(context.effectiveToi, context.effectivePolicy?.effective);
      assert.notStrictEqual(context.effectiveToi, context.personalToi);
      assert.equal(snapshot.toi?.author, "NeuroLift Technologies ASFDK Harness");
      assert.deepEqual(snapshot.otoi?.tiers, ["personal"]);
    },
  );
});

test("local personal TOI overrides the tracked default when present", async () => {
  await withGovernanceFixture(
    async (dir) => {
      await writeFile(
        join(dir, ".toi"),
        JSON.stringify(
          {
            $toi: "1.0.0",
            $tier: "personal",
            identity: {
              author: "Local Test Principal",
            },
            privacy: {
              retention: "session-only",
            },
          },
          null,
          2,
        ),
      );
    },
    async (dir) => {
      const context = await loadGovernanceProtocols({ cwd: dir });
      const snapshot = createProtocolSnapshot(context);

      assert.equal(context.toiPath, join(dir, ".toi"));
      assert.deepEqual(context.diagnostics, []);
      assert.strictEqual(context.effectiveToi, context.personalToi);
      assert.equal(snapshot.toi?.author, "Local Test Principal");
      assert.ok(context.protocols.includes("otoi-honor-resolution"));
    },
  );
});
