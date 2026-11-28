/**
 * `node:sqlite` adapter for the hub store's SqlLike interface, so the same
 * store code that runs in the A2AHub Durable Object runs in unit tests.
 * Returns undefined on Node versions without `node:sqlite`.
 */
import type { SqlLike, SqlValue } from "../../src/hub/sql.ts";

type DatabaseSyncCtor = new (path: string) => {
  prepare(sql: string): { all(...params: SqlValue[]): Record<string, SqlValue>[] };
};

let ctor: DatabaseSyncCtor | undefined;
try {
  ({ DatabaseSync: ctor } = (await import("node:sqlite")) as unknown as { DatabaseSync: DatabaseSyncCtor });
} catch {
  ctor = undefined;
}

export const sqliteAvailable = ctor !== undefined;

export function memorySql(): SqlLike {
  if (!ctor) throw new Error("node:sqlite is not available on this Node version");
  const db = new ctor(":memory:");
  return {
    exec<T>(query: string, ...bindings: SqlValue[]) {
      const rows = db.prepare(query).all(...bindings) as T[];
      return { toArray: () => rows };
    },
  } as SqlLike;
}
