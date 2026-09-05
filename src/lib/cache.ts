import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { getSqlitePath } from "./db/path";

interface CacheRecord<T> { value: T; createdAt: number; expiresAt: number }
interface CacheStore {
  get<T>(key: string, allowStale?: boolean): Promise<CacheRecord<T> | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

let store: CacheStore | null = null;

function sqliteStore(): CacheStore {
  const cachePath = getSqlitePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const db = new DatabaseSync(cachePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)");
  const getStatement = db.prepare("SELECT value, created_at, expires_at FROM api_cache WHERE key = ?");
  const setStatement = db.prepare("INSERT INTO api_cache(key, value, created_at, expires_at) VALUES(?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, created_at=excluded.created_at, expires_at=excluded.expires_at");
  return {
    async get<T>(key: string, allowStale = false) {
      const row = getStatement.get(key) as { value: string; created_at: number; expires_at: number } | undefined;
      if (!row || (!allowStale && row.expires_at < Date.now())) return null;
      return { value: JSON.parse(row.value) as T, createdAt: row.created_at, expiresAt: row.expires_at };
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      const now = Date.now();
      setStatement.run(key, JSON.stringify(value), now, now + ttlSeconds * 1000);
    },
  };
}

function postgresStore(connectionString: string): CacheStore {
  const sql = postgres(connectionString, { max: 4, idle_timeout: 20, connect_timeout: 10 });
  const ready = sql`CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  )`;
  return {
    async get<T>(key: string, allowStale = false) {
      await ready;
      const rows = await sql<{ value: string; created_at: string; expires_at: string }[]>`SELECT value, created_at, expires_at FROM api_cache WHERE key = ${key} LIMIT 1`;
      const row = rows[0];
      if (!row) return null;
      const createdAt = Number(row.created_at); const expiresAt = Number(row.expires_at);
      if (!allowStale && expiresAt < Date.now()) return null;
      return { value: JSON.parse(row.value) as T, createdAt, expiresAt };
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      await ready;
      const now = Date.now(); const serialized = JSON.stringify(value); const expiresAt = now + ttlSeconds * 1000;
      await sql`INSERT INTO api_cache (key, value, created_at, expires_at) VALUES (${key}, ${serialized}, ${now}, ${expiresAt}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at`;
    },
  };
}

function memoryStore(): CacheStore {
  const records = new Map<string, CacheRecord<unknown>>();
  return {
    async get<T>(key: string, allowStale = false) {
      const record = records.get(key) as CacheRecord<T> | undefined;
      return !record || (!allowStale && record.expiresAt < Date.now()) ? null : record;
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      const now = Date.now(); records.set(key, { value, createdAt: now, expiresAt: now + ttlSeconds * 1000 });
    },
  };
}

export function getCache(): CacheStore {
  if (!store) {
    try { store = process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : sqliteStore(); }
    catch (error) { console.warn("SQLite unavailable; falling back to memory cache", error); store = memoryStore(); }
  }
  return store;
}

export function resetCacheForTests() { store = null; }
