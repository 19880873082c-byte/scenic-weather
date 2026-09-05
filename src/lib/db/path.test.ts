import { describe, expect, it } from "vitest";
import { getDatabaseRuntimeStatus } from "./path";

describe("database runtime configuration", () => {
  it("allows local SQLite and explicit persistent SQLite paths outside Vercel", () => {
    expect(getDatabaseRuntimeStatus({})).toMatchObject({ backend: "sqlite", configured: true });
    expect(getDatabaseRuntimeStatus({ SQLITE_PATH: "/data/app.sqlite" })).toMatchObject({ backend: "sqlite", configured: true });
  });

  it("requires PostgreSQL on Vercel when no persistent SQLite path exists", () => {
    const status = getDatabaseRuntimeStatus({ VERCEL: "1" });
    expect(status.configured).toBe(false);
    expect(status.problems[0]).toContain("DATABASE_URL");
  });

  it("does not treat a SQLite path as persistent on Vercel", () => {
    expect(getDatabaseRuntimeStatus({ VERCEL: "1", SQLITE_PATH: ".data/app.sqlite" }).configured).toBe(false);
  });

  it("prefers PostgreSQL when DATABASE_URL is configured", () => {
    expect(getDatabaseRuntimeStatus({ VERCEL: "1", DATABASE_URL: "postgres://example" })).toEqual({ backend: "postgresql", configured: true, problems: [] });
  });
});
