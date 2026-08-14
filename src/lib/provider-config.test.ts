import { describe, expect, it } from "vitest";
import { getProviderStatus, getQWeatherRuntimeConfig } from "./provider-config";

describe("provider configuration", () => {
  it("accepts the assigned HTTPS host and keeps the API key server-side", () => {
    const env = {
      NODE_ENV: "test",
      WEATHER_PROVIDER: "auto",
      QWEATHER_API_HOST: "abc123.qweatherapi.com",
      QWEATHER_API_KEY: "server-secret",
    } as NodeJS.ProcessEnv;
    const status = getProviderStatus(env);
    const runtime = getQWeatherRuntimeConfig(env);
    expect(status.qweather).toMatchObject({ configured: true, authType: "api-key" });
    expect(status.problems).toEqual([]);
    expect(runtime).toEqual({ host: "https://abc123.qweatherapi.com", authHeader: { "X-QW-Api-Key": "server-secret" }, authType: "api-key" });
  });

  it("prefers JWT when both credential forms exist", () => {
    const runtime = getQWeatherRuntimeConfig({
      NODE_ENV: "test",
      QWEATHER_API_HOST: "https://abc123.qweatherapi.com",
      QWEATHER_API_KEY: "key",
      QWEATHER_JWT: "signed-token",
    } as NodeJS.ProcessEnv);
    expect(runtime?.authType).toBe("jwt");
    expect(runtime?.authHeader).toEqual({ Authorization: "Bearer signed-token" });
  });

  it("reports partial or unsafe configuration without exposing credentials", () => {
    const status = getProviderStatus({ NODE_ENV: "test", WEATHER_PROVIDER: "qweather", QWEATHER_API_HOST: "http://example.com", QWEATHER_API_KEY: "secret" } as NodeJS.ProcessEnv);
    expect(status.qweather.configured).toBe(false);
    expect(status.problems.join(" ")).toContain("HTTPS");
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("falls back to auto for an unknown provider value", () => {
    const status = getProviderStatus({ NODE_ENV: "test", WEATHER_PROVIDER: "something-else" } as NodeJS.ProcessEnv);
    expect(status.preference).toBe("auto");
    expect(status.problems[0]).toContain("未知 WEATHER_PROVIDER");
  });
});
