import path from "node:path";

export function getSqlitePath(): string {
  return process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "scenic-weather.sqlite");
}
