import path from "node:path";

export interface DatabaseRuntimeStatus {
  backend: "postgresql" | "sqlite";
  configured: boolean;
  problems: string[];
}

interface DatabaseRuntimeEnv { DATABASE_URL?: string; VERCEL?: string; SQLITE_PATH?: string }

export function getDatabaseRuntimeStatus(env: DatabaseRuntimeEnv = { DATABASE_URL: process.env.DATABASE_URL, VERCEL: process.env.VERCEL, SQLITE_PATH: process.env.SQLITE_PATH }): DatabaseRuntimeStatus {
  if (env.DATABASE_URL?.trim()) return { backend: "postgresql", configured: true, problems: [] };
  if (env.VERCEL) return {
    backend: "sqlite",
    configured: false,
    problems: ["Vercel 等无持久磁盘环境必须配置 DATABASE_URL；SQLite 仅适合本地或挂载了持久磁盘的单机部署"],
  };
  return { backend: "sqlite", configured: true, problems: [] };
}

export function getSqlitePath(): string {
  const status = getDatabaseRuntimeStatus();
  if (!status.configured) throw new Error(status.problems[0]);
  return process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "scenic-weather.sqlite");
}
