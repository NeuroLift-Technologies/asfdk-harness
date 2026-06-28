import "./setup.ts";
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("updated defaults in harness.ts", () => {
  let originalUserId: string | undefined;
  let originalSessionId: string | undefined;

  beforeEach(() => {
    originalUserId = process.env.ASFDK_USER_ID;
    originalSessionId = process.env.ASFDK_SESSION_ID;
  });

  afterEach(() => {
    process.env.ASFDK_USER_ID = originalUserId;
    process.env.ASFDK_SESSION_ID = originalSessionId;
  });

  test("should use asfdk-user as default when no env vars set", async () => {
    delete process.env.ASFDK_USER_ID;
    delete process.env.ASFDK_SESSION_ID;

    const { AsfdkHarness } = await import("../src/harness.js");
    const harness = new AsfdkHarness();

    assert.equal(harness.userId, "asfdk-user");
    assert.ok(harness.sessionId.length > 0);
    // Should be a valid UUID format
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(harness.sessionId));
  });

  test("should use ASFDK_USER_ID env var over default", async () => {
    delete process.env.ASFDK_USER_ID;
    delete process.env.ASFDK_SESSION_ID;
    process.env.ASFDK_USER_ID = "custom-test-user";

    const { AsfdkHarness } = await import("../src/harness.js");
    const harness = new AsfdkHarness();

    assert.equal(harness.userId, "custom-test-user");
  });

  test("should use ASFDK_SESSION_ID env var over default", async () => {
    delete process.env.ASFDK_USER_ID;
    delete process.env.ASFDK_SESSION_ID;
    process.env.ASFDK_SESSION_ID = "custom-test-session";

    const { AsfdkHarness } = await import("../src/harness.js");
    const harness = new AsfdkHarness();

    assert.equal(harness.sessionId, "custom-test-session");
  });

  test("ASFDK_SESSION_ID should be used when set", async () => {
    delete process.env.ASFDK_USER_ID;
    delete process.env.ASFDK_SESSION_ID;
    process.env.ASFDK_SESSION_ID = "asfdk-session";

    const { AsfdkHarness } = await import("../src/harness.js");
    const harness = new AsfdkHarness();

    assert.equal(harness.sessionId, "asfdk-session");
  });

  test("should auto-generate session ID when ASFDK_SESSION_ID not set", async () => {
    delete process.env.ASFDK_USER_ID;
    delete process.env.ASFDK_SESSION_ID;

    const { AsfdkHarness } = await import("../src/harness.js");
    const harness = new AsfdkHarness();

    // Should auto-generate a UUID
    assert.ok(harness.sessionId.length > 0);
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(harness.sessionId));
  });

  test("should prefer constructor options over environment variables", async () => {
    delete process.env.ASFDK_USER_ID;
    delete process.env.ASFDK_SESSION_ID;
    process.env.ASFDK_USER_ID = "env-user";
    process.env.ASFDK_SESSION_ID = "env-session";

    const { AsfdkHarness } = await import("../src/harness.js");
    const harness = new AsfdkHarness({
      userId: "constructor-user",
      sessionId: "constructor-session",
    });

    assert.equal(harness.userId, "constructor-user");
    assert.equal(harness.sessionId, "constructor-session");
  });
});
