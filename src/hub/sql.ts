/**
 * The slice of a SQLite API the hub store needs. A Durable Object passes
 * `ctx.storage.sql`; tests pass a `node:sqlite` adapter. Keeping the store on
 * this interface lets one implementation run in the Worker and in unit tests.
 */
export type SqlValue = string | number | null;

export interface SqlCursor<T> {
  toArray(): T[];
}

export interface SqlLike {
  exec<T extends Record<string, SqlValue> = Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): SqlCursor<T>;
}
