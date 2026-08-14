import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./http";

afterEach(() => vi.unstubAllGlobals());
describe("upstream error handling", () => {
  it("retries transient failures", async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response("no", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await expect(fetchJson("https://example.test", {}, { retries: 1, timeoutMs: 100 })).resolves.toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("does not retry invalid client requests", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 })); vi.stubGlobal("fetch", mock);
    await expect(fetchJson("https://example.test", {}, { retries: 2, timeoutMs: 100 })).rejects.toThrow("400"); expect(mock).toHaveBeenCalledTimes(1);
  });
});
