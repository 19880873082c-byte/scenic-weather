export type WeatherProviderPreference = "auto" | "open-meteo" | "qweather";

export interface QWeatherRuntimeConfig {
  host: string;
  authHeader: { Authorization: string } | { "X-QW-Api-Key": string };
  authType: "jwt" | "api-key";
}

export interface ProviderStatus {
  preference: WeatherProviderPreference;
  qweather: {
    configured: boolean;
    hostConfigured: boolean;
    credentialConfigured: boolean;
    authType: "jwt" | "api-key" | "none";
  };
  problems: string[];
}

export function getProviderStatus(env: NodeJS.ProcessEnv = process.env): ProviderStatus {
  const problems: string[] = [];
  const preference = parsePreference(env.WEATHER_PROVIDER, problems);
  const host = normalizeQWeatherHost(env.QWEATHER_API_HOST, problems);
  const jwt = env.QWEATHER_JWT?.trim();
  const apiKey = env.QWEATHER_API_KEY?.trim();
  const authType = jwt ? "jwt" : apiKey ? "api-key" : "none";

  if (host && !jwt && !apiKey) problems.push("已配置 QWEATHER_API_HOST，但缺少 QWEATHER_JWT 或 QWEATHER_API_KEY");
  if (!host && (jwt || apiKey)) problems.push("已配置和风凭据，但缺少 QWEATHER_API_HOST");
  if (preference === "qweather" && !(host && (jwt || apiKey))) problems.push("WEATHER_PROVIDER=qweather，但和风配置不完整");

  return {
    preference,
    qweather: {
      configured: Boolean(host && (jwt || apiKey)),
      hostConfigured: Boolean(host),
      credentialConfigured: Boolean(jwt || apiKey),
      authType,
    },
    problems: [...new Set(problems)],
  };
}

export function getQWeatherRuntimeConfig(env: NodeJS.ProcessEnv = process.env): QWeatherRuntimeConfig | null {
  const status = getProviderStatus(env);
  if (!status.qweather.configured) return null;
  const problems: string[] = [];
  const host = normalizeQWeatherHost(env.QWEATHER_API_HOST, problems);
  if (!host) return null;
  const jwt = env.QWEATHER_JWT?.trim();
  if (jwt) return { host, authHeader: { Authorization: `Bearer ${jwt}` }, authType: "jwt" };
  const apiKey = env.QWEATHER_API_KEY?.trim();
  return apiKey ? { host, authHeader: { "X-QW-Api-Key": apiKey }, authType: "api-key" } : null;
}

function parsePreference(value: string | undefined, problems: string[]): WeatherProviderPreference {
  const normalized = value?.trim().toLowerCase() || "auto";
  if (normalized === "auto" || normalized === "open-meteo" || normalized === "qweather") return normalized;
  problems.push(`未知 WEATHER_PROVIDER=${normalized}，已按 auto 处理`);
  return "auto";
}

function normalizeQWeatherHost(value: string | undefined, problems: string[]): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:") {
      problems.push("QWEATHER_API_HOST 必须使用 HTTPS");
      return null;
    }
    if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
      problems.push("QWEATHER_API_HOST 只能填写控制台分配的主机名，不要包含路径、参数或账号信息");
      return null;
    }
    return url.origin;
  } catch {
    problems.push("QWEATHER_API_HOST 格式无效");
    return null;
  }
}
