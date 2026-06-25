import { rmSync, rmdirSync } from "node:fs";

// Hermetic test identity. The ASFDK foundation (via the Sleepwalker Protocol) persists
// continuity data to `.swp_storage/<userId>.json` relative to cwd. Using a dedicated test
// user guarantees the suite never reads or overwrites a real user's continuity file, and
// lets us clean up only what the tests created.
process.env.ASFDK_USER_ID ??= "asfdk-harness-selftest";
export const TEST_USER = process.env.ASFDK_USER_ID;

/** Remove this test user's continuity file, and the storage dir if it is now empty. */
export function cleanupSwpStorage(): void {
  try {
    rmSync(`.swp_storage/${TEST_USER}.json`, { force: true });
  } catch {
    /* ignore */
  }
  try {
    // rmdirSync throws ENOTEMPTY if a real user's file is present — that is the point.
    rmdirSync(".swp_storage");
  } catch {
    /* ignore */
  }
}
