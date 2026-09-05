import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { scenicCatalog } from "../catalog";
import type { Place, ScenicType } from "../types";
import { getSqlitePath } from "./path";
import { migration001 } from "./migrations/001_create_scenic_registry";
import { migration002 } from "./migrations/002_seed_curated_scenic_areas";

export type ScenicRegistry = {
  search(query: string, limit?: number): Promise<Place[]>;
  submitCorrection(input: CorrectionInput): Promise<string>;
  close(): Promise<void>;
};

export interface CorrectionInput {
  scenicPlaceId?: string;
  submittedName: string;
  reason: string;
  proposed: { name?: string; province?: string; city?: string; address?: string; latitude?: number; longitude?: number };
}

let registry: ScenicRegistry | null = null;

export function getScenicRegistry(): ScenicRegistry {
  if (!registry) registry = process.env.DATABASE_URL ? createPostgresRegistry(process.env.DATABASE_URL) : createSqliteScenicRegistry();
  return registry;
}

export function resetRegistryForTests() { registry = null; }

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s·•\-—_（）()]+/g, "");
}

function placeId(name: string, longitude: number, latitude: number): string {
  return `scenic_${createHash("sha1").update(`${name}:${longitude.toFixed(5)}:${latitude.toFixed(5)}`).digest("hex").slice(0, 16)}`;
}

export function createSqliteScenicRegistry(file = getSqlitePath()): ScenicRegistry {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file); db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  const search = db.prepare(`
    SELECT DISTINCT p.*,
      CASE WHEN lower(p.standard_name) = lower(?) OR a.normalized_alias = ? THEN 3
           WHEN lower(p.standard_name) LIKE lower(?) OR a.normalized_alias LIKE ? THEN 2 ELSE 1 END AS match_rank
    FROM scenic_places p LEFT JOIN scenic_aliases a ON a.scenic_place_id = p.id
    WHERE p.active = 1 AND (lower(p.standard_name) LIKE lower(?) OR a.normalized_alias LIKE ? OR lower(p.province || p.city) LIKE lower(?))
    ORDER BY match_rank DESC, p.confidence DESC, p.standard_name ASC LIMIT ?
  `);
  const correction = db.prepare("INSERT INTO place_corrections(id, scenic_place_id, submitted_name, proposed_json, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)");
  return {
    async search(query, limit = 10) {
      const normalized = normalize(query); const like = `%${query.trim()}%`; const normalizedLike = `%${normalized}%`;
      const rows = search.all(query.trim(), normalized, like, normalizedLike, like, normalizedLike, like, limit) as unknown as RegistryRow[];
      return uniqueRegistryRows(rows).map(toPlace);
    },
    async submitCorrection(input) {
      const id = randomUUID(); correction.run(id, input.scenicPlaceId?.replace(/^registry:/, "") ?? null, input.submittedName, JSON.stringify(input.proposed), input.reason, Date.now()); return id;
    },
    async close() { db.close(); },
  };
}

function migrateSqlite(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const applied = new Map((db.prepare("SELECT version, checksum FROM schema_migrations").all() as { version: string; checksum: string }[]).map((row) => [row.version, row.checksum]));
  if (applied.has(migration001.version) && applied.get(migration001.version) !== migration001.checksum) throw new Error("Migration 001 checksum mismatch");
  if (!applied.has(migration001.version)) runSqliteTransaction(db, () => { db.exec(migration001.sqliteUp); db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?, ?)").run(migration001.version, migration001.name, migration001.checksum, Date.now()); });
  if (applied.has(migration002.version) && applied.get(migration002.version) !== migration002.checksum) throw new Error("Migration 002 checksum mismatch");
  if (!applied.has(migration002.version)) runSqliteTransaction(db, () => { seedSqlite(db); db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?, ?)").run(migration002.version, migration002.name, migration002.checksum, Date.now()); });
}

function runSqliteTransaction(db: DatabaseSync, operation: () => void) {
  db.exec("BEGIN IMMEDIATE");
  try {
    operation();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedSqlite(db: DatabaseSync) {
  const now = Date.now();
  const insertPlace = db.prepare(`INSERT OR IGNORE INTO scenic_places(id,standard_name,province,city,address,latitude,longitude,elevation,scenic_type,coordinate_system,coordinate_precision,quality_status,confidence,source_name,source_reference,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'WGS84','center','curated',78,'curated_seed','internal:v1',1,?,?)`);
  const insertAlias = db.prepare("INSERT OR IGNORE INTO scenic_aliases(id,scenic_place_id,alias,normalized_alias,alias_type,created_at) VALUES(?,?,?,?,?,?)");
  for (const item of scenicCatalog) {
    const id = placeId(item.name, item.longitude, item.latitude); insertPlace.run(id, item.name, item.province, item.city, item.address, item.latitude, item.longitude, item.elevation ?? null, item.type, now, now);
    for (const alias of [item.name, ...(item.aliases ?? [])]) insertAlias.run(`${id}_${createHash("sha1").update(normalize(alias)).digest("hex").slice(0, 10)}`, id, alias, normalize(alias), alias === item.name ? "standard" : "common", now);
  }
}

function createPostgresRegistry(connectionString: string): ScenicRegistry {
  const sql = postgres(connectionString, { max: 4, idle_timeout: 20, connect_timeout: 10 });
  const ready = migratePostgres(sql);
  return {
    async search(query, limit = 10) {
      await ready; const normalized = normalize(query); const like = `%${query.trim()}%`; const normalizedLike = `%${normalized}%`;
      const rows = await sql<RegistryRow[]>`
        SELECT DISTINCT p.*,
          CASE WHEN lower(p.standard_name) = lower(${query.trim()}) OR a.normalized_alias = ${normalized} THEN 3
               WHEN lower(p.standard_name) LIKE lower(${like}) OR a.normalized_alias LIKE ${normalizedLike} THEN 2 ELSE 1 END AS match_rank
        FROM scenic_places p LEFT JOIN scenic_aliases a ON a.scenic_place_id = p.id
        WHERE p.active = TRUE AND (lower(p.standard_name) LIKE lower(${like}) OR a.normalized_alias LIKE ${normalizedLike} OR lower(p.province || p.city) LIKE lower(${like}))
        ORDER BY match_rank DESC, p.confidence DESC, p.standard_name ASC LIMIT ${limit}`;
      return uniqueRegistryRows(rows).map(toPlace);
    },
    async submitCorrection(input) {
      await ready; const id = randomUUID();
      await sql`INSERT INTO place_corrections(id,scenic_place_id,submitted_name,proposed_json,reason,status,created_at) VALUES(${id},${input.scenicPlaceId?.replace(/^registry:/, "") ?? null},${input.submittedName},${JSON.stringify(input.proposed)},${input.reason},'pending',${Date.now()})`;
      return id;
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}

async function migratePostgres(sql: postgres.Sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at BIGINT NOT NULL)`;
  await sql`SELECT pg_advisory_lock(79420130813)`;
  try {
    const appliedRows = await sql<{ version: string; checksum: string }[]>`SELECT version, checksum FROM schema_migrations`;
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
    if (applied.has(migration001.version) && applied.get(migration001.version) !== migration001.checksum) throw new Error("Migration 001 checksum mismatch");
    if (!applied.has(migration001.version)) { await sql.unsafe(migration001.postgresUp); await sql`INSERT INTO schema_migrations VALUES(${migration001.version},${migration001.name},${migration001.checksum},${Date.now()})`; }
    if (applied.has(migration002.version) && applied.get(migration002.version) !== migration002.checksum) throw new Error("Migration 002 checksum mismatch");
    if (!applied.has(migration002.version)) { await seedPostgres(sql); await sql`INSERT INTO schema_migrations VALUES(${migration002.version},${migration002.name},${migration002.checksum},${Date.now()})`; }
  } finally { await sql`SELECT pg_advisory_unlock(79420130813)`; }
}

async function seedPostgres(sql: postgres.Sql) {
  const now = Date.now();
  for (const item of scenicCatalog) {
    const id = placeId(item.name, item.longitude, item.latitude);
    await sql`INSERT INTO scenic_places(id,standard_name,province,city,address,latitude,longitude,elevation,scenic_type,coordinate_system,coordinate_precision,quality_status,confidence,source_name,source_reference,active,created_at,updated_at) VALUES(${id},${item.name},${item.province},${item.city},${item.address},${item.latitude},${item.longitude},${item.elevation ?? null},${item.type},'WGS84','center','curated',78,'curated_seed','internal:v1',TRUE,${now},${now}) ON CONFLICT(id) DO NOTHING`;
    for (const alias of [item.name, ...(item.aliases ?? [])]) {
      const aliasId = `${id}_${createHash("sha1").update(normalize(alias)).digest("hex").slice(0, 10)}`;
      await sql`INSERT INTO scenic_aliases(id,scenic_place_id,alias,normalized_alias,alias_type,created_at) VALUES(${aliasId},${id},${alias},${normalize(alias)},${alias === item.name ? "standard" : "common"},${now}) ON CONFLICT(scenic_place_id,normalized_alias) DO NOTHING`;
    }
  }
}

interface RegistryRow { id: string; standard_name: string; province: string; city: string; address: string; latitude: number; longitude: number; elevation: number | null; scenic_type: string; coordinate_precision: string; quality_status: string; confidence: number; source_reference: string | null }
function uniqueRegistryRows(rows: RegistryRow[]): RegistryRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function toPlace(row: RegistryRow): Place {
  return { id: `registry:${row.id}`, name: row.standard_name, province: row.province, city: row.city, address: row.address, latitude: Number(row.latitude), longitude: Number(row.longitude), elevation: row.elevation === null ? undefined : Number(row.elevation), type: row.scenic_type as ScenicType, source: "registry", quality: row.quality_status as Place["quality"], confidence: row.confidence, coordinatePrecision: row.coordinate_precision as Place["coordinatePrecision"], sourceReference: row.source_reference ?? undefined };
}
