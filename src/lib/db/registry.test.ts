import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteScenicRegistry } from "./registry";

describe("scenic registry migrations and search", () => {
  let directory: string;
  let databasePath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "scenic-registry-"));
    databasePath = path.join(directory, "registry.sqlite");
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("applies immutable migrations once and seeds curated places", async () => {
    const first = createSqliteScenicRegistry(databasePath);
    const second = createSqliteScenicRegistry(databasePath);

    const db = new Database(databasePath, { readonly: true });
    const migrationCount = (db.prepare("SELECT count(*) AS count FROM schema_migrations").get() as { count: number }).count;
    const placeCount = (db.prepare("SELECT count(*) AS count FROM scenic_places").get() as { count: number }).count;
    db.close();
    await first.close();
    await second.close();

    expect(migrationCount).toBe(2);
    expect(placeCount).toBeGreaterThanOrEqual(20);
  });

  it("finds an alias and exposes provenance and confidence", async () => {
    const registry = createSqliteScenicRegistry(databasePath);
    const results = await registry.search("黄山");
    const [place] = results;

    expect(place.name).toContain("黄山");
    expect(place.source).toBe("registry");
    expect(place.quality).toBe("curated");
    expect(place.coordinatePrecision).toBe("center");
    expect(place.confidence).toBe(78);
    expect(new Set(results.map((item) => item.id)).size).toBe(results.length);
    await registry.close();
  });

  it("records a correction against the canonical registry id", async () => {
    const registry = createSqliteScenicRegistry(databasePath);
    const [place] = await registry.search("黄山");
    const correctionId = await registry.submitCorrection({
      scenicPlaceId: place.id,
      submittedName: place.name,
      reason: "入口坐标需要人工复核",
      proposed: { address: "建议核对南大门入口" },
    });

    const db = new Database(databasePath, { readonly: true });
    const row = db.prepare("SELECT id, scenic_place_id, status FROM place_corrections WHERE id = ?").get(correctionId) as { id: string; scenic_place_id: string; status: string };
    db.close();
    await registry.close();

    expect(row.id).toBe(correctionId);
    expect(row.scenic_place_id).toBe(place.id.replace(/^registry:/, ""));
    expect(row.status).toBe("pending");
  });
});
