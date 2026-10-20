import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env, Access } from "../../src/server/types";

// Execute production migrations and SQL against actual SQLite, including UNIQUE,
// foreign-key, RETURNING and transaction behavior; don't mock query results.
export function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../../migrations/0001_kitchen.sql", import.meta.url),
      "utf8",
    ),
  );
  class Statement {
    values: unknown[] = [];
    constructor(public sql: string) {}
    bind(...values: unknown[]) {
      this.values = values;
      return this;
    }
    execute() {
      const stmt = sqlite.prepare(this.sql);
      const values = this.values as (string | number | null | Uint8Array)[];
      const results = stmt.columns().length ? stmt.all(...values) : [];
      let changes = 0;
      if (!stmt.columns().length) changes = Number(stmt.run(...values).changes);
      else
        changes = Number(
          (sqlite.prepare("SELECT changes() AS n").get() as { n: number }).n,
        );
      return { results, success: true, meta: { changes } };
    }
    async all() {
      return this.execute();
    }
    async run() {
      return this.execute();
    }
    async first(column?: string) {
      const result = this.execute().results[0];
      return result ? (column ? result[column] : result) : null;
    }
    async raw() {
      return this.execute().results.map((row) => Object.values(row));
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((stmt) => stmt.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  const user = {
    id: crypto.randomUUID(),
    name: "Alex",
    role: "owner" as const,
  };
  sqlite
    .prepare("INSERT INTO users(id,name,role) VALUES (?,?,?)")
    .run(user.id, user.name, user.role);
  const env = {
    DB: db,
    APP_ORIGIN: "https://kitchen.example",
    HOME_NAME: "Our kitchen",
    TIME_ZONE: "Europe/Berlin",
    ENCRYPTION_KEY: "a".repeat(64),
    BRING_API_KEY: "test-bring-application-key",
    BOOTSTRAP_TOKEN: "test-bootstrap-token-of-sufficient-length",
  } as Env;
  const access: Access = {
    user,
    scopes: ["mcp:read", "mcp:write", "mcp:admin"],
    agent: false,
  };
  return { sqlite, db, env, access };
}
