export const migration001 = {
  version: "001",
  name: "create_scenic_registry",
  checksum: "sha256:scenic-registry-v1-20260813",
  sqliteUp: `
    CREATE TABLE IF NOT EXISTS scenic_places (
      id TEXT PRIMARY KEY,
      standard_name TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      elevation REAL,
      scenic_type TEXT NOT NULL,
      coordinate_system TEXT NOT NULL DEFAULT 'WGS84',
      coordinate_precision TEXT NOT NULL DEFAULT 'center',
      quality_status TEXT NOT NULL DEFAULT 'curated',
      confidence INTEGER NOT NULL DEFAULT 75,
      source_name TEXT NOT NULL,
      source_reference TEXT,
      verified_at INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenic_aliases (
      id TEXT PRIMARY KEY,
      scenic_place_id TEXT NOT NULL REFERENCES scenic_places(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      alias_type TEXT NOT NULL DEFAULT 'common',
      created_at INTEGER NOT NULL,
      UNIQUE(scenic_place_id, normalized_alias)
    );
    CREATE TABLE IF NOT EXISTS place_corrections (
      id TEXT PRIMARY KEY,
      scenic_place_id TEXT,
      submitted_name TEXT NOT NULL,
      proposed_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_scenic_places_name ON scenic_places(standard_name);
    CREATE INDEX IF NOT EXISTS idx_scenic_places_region ON scenic_places(province, city);
    CREATE INDEX IF NOT EXISTS idx_scenic_aliases_normalized ON scenic_aliases(normalized_alias);
    CREATE INDEX IF NOT EXISTS idx_place_corrections_status ON place_corrections(status, created_at);
  `,
  sqliteDown: `
    DROP TABLE IF EXISTS place_corrections;
    DROP TABLE IF EXISTS scenic_aliases;
    DROP TABLE IF EXISTS scenic_places;
  `,
  postgresUp: `
    CREATE TABLE IF NOT EXISTS scenic_places (
      id TEXT PRIMARY KEY,
      standard_name TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT,
      address TEXT NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      elevation DOUBLE PRECISION,
      scenic_type TEXT NOT NULL,
      coordinate_system TEXT NOT NULL DEFAULT 'WGS84',
      coordinate_precision TEXT NOT NULL DEFAULT 'center',
      quality_status TEXT NOT NULL DEFAULT 'curated',
      confidence INTEGER NOT NULL DEFAULT 75,
      source_name TEXT NOT NULL,
      source_reference TEXT,
      verified_at BIGINT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenic_aliases (
      id TEXT PRIMARY KEY,
      scenic_place_id TEXT NOT NULL REFERENCES scenic_places(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      alias_type TEXT NOT NULL DEFAULT 'common',
      created_at BIGINT NOT NULL,
      UNIQUE(scenic_place_id, normalized_alias)
    );
    CREATE TABLE IF NOT EXISTS place_corrections (
      id TEXT PRIMARY KEY,
      scenic_place_id TEXT,
      submitted_name TEXT NOT NULL,
      proposed_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      reviewed_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_scenic_places_name ON scenic_places(standard_name);
    CREATE INDEX IF NOT EXISTS idx_scenic_places_region ON scenic_places(province, city);
    CREATE INDEX IF NOT EXISTS idx_scenic_aliases_normalized ON scenic_aliases(normalized_alias);
    CREATE INDEX IF NOT EXISTS idx_place_corrections_status ON place_corrections(status, created_at);
  `,
  postgresDown: `
    DROP TABLE IF EXISTS place_corrections;
    DROP TABLE IF EXISTS scenic_aliases;
    DROP TABLE IF EXISTS scenic_places;
  `,
} as const;
