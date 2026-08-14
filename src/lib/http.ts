export class UpstreamError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, options: { timeoutMs?: number; retries?: number } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 9000;
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal, headers: { Accept: "application/json", ...init.headers }, cache: "no-store" });
      if (!response.ok) {
        const error = new UpstreamError(`上游服务返回 ${response.status}`, response.status);
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } else return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (error instanceof UpstreamError && error.status < 500 && error.status !== 429) throw error;
    } finally { clearTimeout(timer); }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw new UpstreamError(lastError instanceof Error ? `数据服务暂不可用：${lastError.message}` : "数据服务暂不可用");
}

const buckets = new Map<string, number[]>();
export function checkRateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) { buckets.set(key, recent); return false; }
  recent.push(now); buckets.set(key, recent); return true;
}
