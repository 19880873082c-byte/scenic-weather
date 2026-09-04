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

interface RateBucket { timestamps: number[]; windowMs: number; lastSeen: number }
const buckets = new Map<string, RateBucket>();
let lastBucketSweep = 0;

export function checkRateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  sweepRateBuckets(now);
  const current = buckets.get(key);
  const recent = (current?.timestamps ?? []).filter((timestamp) => now - timestamp < windowMs);
  const bucket = { timestamps: recent, windowMs, lastSeen: now };
  if (recent.length >= limit) { buckets.set(key, bucket); return false; }
  recent.push(now); buckets.set(key, bucket); return true;
}

function sweepRateBuckets(now: number): void {
  if (now - lastBucketSweep < 60_000 && buckets.size < 5_000) return;
  lastBucketSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeen >= bucket.windowMs) buckets.delete(key);
  }
  if (buckets.size <= 10_000) return;
  const overflow = buckets.size - 10_000;
  [...buckets.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen).slice(0, overflow).forEach(([key]) => buckets.delete(key));
}

export function resetRateLimitsForTests(): void { buckets.clear(); lastBucketSweep = 0; }
